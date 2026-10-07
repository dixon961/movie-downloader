import fs from 'fs';
import { formatSize } from '../utils/formatters.js';
import config from '../config/index.js';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import tough from 'tough-cookie';

// Path inside the container that maps to the qBittorrent downloads folder.
// Mounted read-only in docker-compose.yml ("Media volume" comment).
const DOWNLOADS_PATH = process.env.DOWNLOADS_PATH || '/media';

const { url: QB_URL, user: QB_USER, pass: QB_PASS } = config.qbittorrent;

function fromStatfs(targetPath) {
  const stats = fs.statfsSync(targetPath);
  const total = stats.blocks * stats.bsize;
  const used = (stats.blocks - stats.bfree) * stats.bsize;
  const free = stats.bavail * stats.bsize;

  // Same formula as `df`: blocks reserved for root are excluded from the
  // denominator, so the number matches what `df -h` shows.
  const usable = used + free;

  return {
    total,
    used,
    free,
    usedPercent: usable > 0 ? Math.round((used / usable) * 100) : 0,
    source: targetPath,
  };
}

// Fallback: qBittorrent knows the free space of its save path. Only the
// free space is exposed, so capacity is reported as unknown.
async function fromQbittorrent() {
  if (!QB_USER || !QB_PASS) {
    throw new Error('qBittorrent credentials are not configured.');
  }

  const jar = new tough.CookieJar();
  const client = wrapper(axios.create({ baseURL: QB_URL, jar, withCredentials: true }));

  const loginResp = await client.post(
    '/api/v2/auth/login',
    new URLSearchParams({ username: QB_USER, password: QB_PASS }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (!(loginResp.data === 'Ok.' || loginResp.status === 204)) {
    throw new Error(`qBittorrent login failed: ${loginResp.data}`);
  }

  const resp = await client.get('/api/v2/sync/maindata', { params: { rid: 0 } });
  const free = resp.data?.server_state?.free_space_on_disk;

  if (typeof free !== 'number') {
    throw new Error('qBittorrent did not report free space.');
  }

  return {
    total: null,
    used: null,
    free,
    usedPercent: null,
    source: 'qBittorrent',
  };
}

export async function getDiskSpace() {
  let info;

  try {
    info = fromStatfs(DOWNLOADS_PATH);
  } catch (err) {
    console.warn(
      `Could not read disk space from "${DOWNLOADS_PATH}" (${err.message}), falling back to qBittorrent.`
    );
    info = await fromQbittorrent();
  }

  return {
    ...info,
    totalHuman: info.total === null ? 'Unknown' : formatSize(info.total),
    usedHuman: info.used === null ? 'Unknown' : formatSize(info.used),
    freeHuman: formatSize(info.free),
  };
}