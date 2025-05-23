import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import tough from 'tough-cookie';
import config from '../config/index.js';

const { url: QB_URL, user: QB_USER, pass: QB_PASS } = config.qbittorrent;

const jar = new tough.CookieJar();
const client = wrapper(axios.create({
  baseURL: QB_URL,
  jar,
  withCredentials: true,
}));

let isAuthenticated = false;
let authRetryAttempted = false;

async function ensureAuthenticated() {
  if (isAuthenticated) {
    // Optionally, add a check here to see if the session is still valid
    // For simplicity, we assume it is once authenticated.
    return;
  }

  if (!QB_USER || !QB_PASS) {
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
      authRetryAttempted = false; // Reset retry flag on success
    } else {
      throw new Error(`qBittorrent login failed: ${loginResp.data}`);
    }
  } catch (error) {
    isAuthenticated = false;
    console.error('qBittorrent authentication error:', error.message);
    throw error; // Re-throw to be caught by the caller
  }
}

export async function addTorrent(link) {
  try {
    await ensureAuthenticated();
  } catch (authError) {
    // If initial auth fails, and we haven't retried in this call chain
    if (!authRetryAttempted) {
        console.log('Retrying qBittorrent authentication once more...');
        authRetryAttempted = true;
        isAuthenticated = false; // Force re-authentication
        try {
            await ensureAuthenticated();
        } catch (retryAuthError) {
            throw new Error(`qBittorrent authentication failed after retry: ${retryAuthError.message}`);
        }
    } else {
        throw authError; // If retry already attempted, throw original auth error
    }
  }


  console.log('Sending link to qBittorrent:', link);
  try {
    const addResp = await client.post(
      '/api/v2/torrents/add',
      new URLSearchParams({ urls: link }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    console.log('Add torrent response status:', addResp.status, 'Data:', addResp.data);
    if (addResp.data === 'Ok.') {
      return { status: 'OK', message: 'Torrent added successfully.' };
    } else {
      // qBittorrent might return 200 OK but with an error message in the body
      throw new Error(`Failed to add torrent: ${addResp.data}`);
    }
  } catch (error) {
    console.error('Error adding torrent to qBittorrent:', error.response?.data || error.message);
    // If it's an auth error (e.g. session expired), reset auth state
    if (error.response?.status === 401 || error.response?.status === 403) {
        isAuthenticated = false;
        console.log('qBittorrent session might have expired. Resetting authentication state.');
    }
    throw error; // Re-throw for the controller to handle
  }
}