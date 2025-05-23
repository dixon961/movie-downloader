import * as qbittorrentService from '../services/qbittorrentService.js';

export async function download(req, res, next) {
  // ... (existing download function) ...
  const { link } = req.body;
  if (!link) {
    return res.status(400).json({ error: 'Link parameter "link" is required in the body.' });
  }

  try {
    const result = await qbittorrentService.addTorrent(link);
    res.json({ status: 'OK', message: result.message });
  } catch (err) {
    console.error(`Error in download controller for link "${link}":`, err.response?.data || err.message);
    const errorToPass = err instanceof Error ? err : new Error(err.message || 'Failed to download torrent');
    errorToPass.status = err.response?.status || 500;
    next(errorToPass);
  }
}

// NEW CONTROLLER FUNCTION
export async function getDownloadStatus(req, res, next) {
  try {
    const statuses = await qbittorrentService.getTorrentsInfo();
    res.json(statuses);
  } catch (err) {
    console.error('Error in getDownloadStatus controller:', err.message);
    const errorToPass = err instanceof Error ? err : new Error(err.message || 'Failed to fetch download statuses.');
    errorToPass.status = err.response?.status || 500;
    next(errorToPass);
  }
}