import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import tough from 'tough-cookie';
import config from '../config/index.js';
import { formatSize } from '../utils/formatters.js'; // We'll need formatSize here too

const { url: QB_URL, user: QB_USER, pass: QB_PASS } = config.qbittorrent;

const jar = new tough.CookieJar();
const client = wrapper(axios.create({
  baseURL: QB_URL,
  jar,
  withCredentials: true,
}));

let isAuthenticated = false;
let authRetryAttempted = false; // Per-call retry flag

async function ensureAuthenticated(forceReAuth = false) {
  if (isAuthenticated && !forceReAuth) {
    return;
  }

  if (!QB_USER || !QB_PASS) {
    console.error('qBittorrent username or password not configured.');
    throw new Error('qBittorrent username or password not configured.');
  }

  console.log('Authenticating with qBittorrent...');
  try {
    const loginResp = await client.post(
      '/api/v2/auth/login',
      new URLSearchParams({ username: QB_USER, password: QB_PASS }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    if (loginResp.data === 'Ok.') {
      console.log('qBittorrent authentication successful.');
      isAuthenticated = true;
      authRetryAttempted = false; // Reset general retry flag on success
    } else {
      isAuthenticated = false;
      throw new Error(`qBittorrent login failed: ${loginResp.data}`);
    }
  } catch (error) {
    isAuthenticated = false;
    console.error('qBittorrent authentication error:', error.message);
    throw error;
  }
}

// Helper to handle API calls with authentication
async function qbApiCall(method, path, data = null, params = null) {
  let attempt = 0;
  const maxAttempts = 2; // Initial attempt + 1 retry

  while (attempt < maxAttempts) {
    try {
      await ensureAuthenticated(attempt > 0); // Force re-auth on retry
      authRetryAttempted = attempt > 0; // Set per-call retry flag

      let response;
      const requestConfig = { headers: {} };
      if (params) requestConfig.params = params;

      if (method.toLowerCase() === 'post') {
        requestConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        response = await client.post(path, data ? new URLSearchParams(data).toString() : '', requestConfig);
      } else { // GET
        response = await client.get(path, requestConfig);
      }
      
      authRetryAttempted = false; // Reset per-call retry flag on success
      return response.data;

    } catch (error) {
      console.error(`qBittorrent API call to ${path} failed (attempt ${attempt + 1}):`, error.response?.data || error.message);
      isAuthenticated = false; // Assume auth might be lost on any API error
      attempt++;
      if (attempt >= maxAttempts) {
        throw error; // Re-throw after max attempts
      }
      // Wait a bit before retrying (optional)
      // await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  // Should not be reached if logic is correct, but as a fallback:
  throw new Error(`qBittorrent API call to ${path} failed after multiple retries.`);
}


export async function addTorrent(link) {
  console.log('Sending link to qBittorrent:', link);
  try {
    const responseData = await qbApiCall('post', '/api/v2/torrents/add', { urls: link });
    if (responseData === 'Ok.') {
      return { status: 'OK', message: 'Torrent added successfully.' };
    } else {
      throw new Error(`Failed to add torrent: ${responseData}`);
    }
  } catch (error) {
    // Error already logged in qbApiCall
    throw new Error(`Failed to add torrent to qBittorrent: ${error.message}`);
  }
}

// NEW FUNCTION to get torrent list
export async function getTorrentsInfo() {
  console.log('Fetching torrent list from qBittorrent...');
  try {
    const torrents = await qbApiCall('get', '/api/v2/torrents/info');
    // API returns an array of torrent objects
    // We need to map them to a more friendly format
    return torrents.map(torrent => ({
      hash: torrent.hash,
      name: torrent.name,
      size: formatSize(torrent.size), // Total size of the torrent
      total_size: torrent.total_size, // For calculating percentage if needed
      downloaded: formatSize(torrent.downloaded),
      progress: (torrent.progress * 100).toFixed(1), // progress is 0 to 1
      status: mapStatusCodeToString(torrent.state), // qBittorrent state
      // Common states: downloading, pausedUP, pausedDL, queuedUP, queuedDL, uploading, stalledUP, stalledDL, checkingUP, checkingDL, error
      // You might want to simplify these for the UI
      // eta: torrent.eta, // Estimated time remaining in seconds
      // dlspeed: formatSize(torrent.dlspeed) + '/s',
      // upspeed: formatSize(torrent.upspeed) + '/s',
      // ratio: torrent.ratio.toFixed(2),
    }));
  } catch (error) {
    // Error already logged in qbApiCall
    throw new Error(`Failed to fetch torrent info from qBittorrent: ${error.message}`);
  }
}

export async function deleteTorrent(hash, deleteFiles = true) {
  if (!hash) {
    console.error('qBittorrent deleteTorrent: Hash is required.');
    throw new Error('Torrent hash is required to delete.');
  }
  console.log(`Requesting deletion of torrent ${hash} from qBittorrent (deleteFiles: ${deleteFiles})...`);
  try {
    // The API endpoint is /api/v2/torrents/delete
    // It accepts 'hashes' (pipe-separated if multiple) and 'deleteFiles' (boolean)
    const params = {
      hashes: hash, // For a single torrent
      deleteFiles: deleteFiles.toString() // API expects 'true' or 'false' as strings
    };
    // This endpoint uses POST, but parameters are often sent in the query string or form-data body.
    // Let's try form-data body as it's common for qB actions.
    // The qbApiCall helper needs to be flexible enough or we make a specific call.
    // For simplicity, let's use a direct call here, ensuring form-urlencoded content type.

    await ensureAuthenticated(); // Ensure we are logged in

    const response = await client.post(
        '/api/v2/torrents/delete',
        new URLSearchParams(params).toString(), // Send as x-www-form-urlencoded
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
    );
    
    // qBittorrent API usually returns 200 OK on success for this, without a specific "Ok." message in body.
    // If it fails, it might return a non-200 status or an error message in the body.
    if (response.status === 200) {
      console.log(`Torrent ${hash} deletion request successful.`);
      return { status: 'OK', message: `Torrent ${deleteFiles ? 'and files ' : ''}marked for deletion.` };
    } else {
      // This case might not be hit if axios throws for non-2xx statuses by default
      throw new Error(`Failed to delete torrent ${hash}. Status: ${response.status}, Data: ${response.data}`);
    }

  } catch (error) {
    const errorMessage = error.response?.data || error.message;
    console.error(`Failed to delete torrent ${hash} from qBittorrent:`, errorMessage);
    // If it's an auth error (e.g. session expired), reset auth state
    if (error.response?.status === 401 || error.response?.status === 403) {
        isAuthenticated = false; // Handled by ensureAuthenticated/qbApiCall in more complex scenarios
        console.log('qBittorrent session might have expired. Resetting authentication state.');
    }
    throw new Error(`Failed to delete torrent: ${errorMessage}`);
  }
}

// Helper to map qBittorrent states to human-readable strings
function mapStatusCodeToString(state) {
  // Based on qBittorrent Web API documentation for 'state'
  const states = {
    error: 'Error ❌',
    missingFiles: 'Missing Files ⚠️',
    uploading: 'Uploading ⬆️',
    pausedUP: 'Paused (Seeding) ⏸️🌱',
    pausedDL: 'Paused (Downloading) ⏸️📥',
    queuedUP: 'Queued (Seeding) 🕒🌱',
    queuedDL: 'Queued (Downloading) 🕒📥',
    stalledUP: 'Stalled (Seeding) 🛑🌱',
    stalledDL: 'Stalled (Downloading) 🛑📥',
    checkingUP: 'Checking (Seeding) 🔍🌱',
    checkingDL: 'Checking (Downloading) 🔍📥',
    forcedUP: 'Forced Seeding 🚀🌱', // (meta)
    forcedDL: 'Forced Downloading 🚀📥', // (meta)
    downloading: 'Downloading 📥',
    metaDL: 'Fetching Metadata ℹ️',
    allocating: 'Allocating 💾',
    moving: 'Moving 🚚',
    unknown: 'Unknown 🤔'
  };
  return states[state] || state; // Fallback to raw state if not mapped
}