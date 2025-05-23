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

export async function deleteTorrent(req, res, next) {
  const { hash } = req.params; // Assuming hash is part of the URL path
  const { deleteFiles } = req.query; // e.g., /api/download/torrent/HASH_HERE?deleteFiles=true

  if (!hash) {
    return res.status(400).json({ error: 'Torrent hash is required in the URL path.' });
  }

  // Convert deleteFiles query param to boolean, default to true if not specified or invalid
  let shouldDeleteFiles = true;
  if (deleteFiles !== undefined) {
    shouldDeleteFiles = deleteFiles.toLowerCase() === 'true';
  }

  try {
    const result = await qbittorrentService.deleteTorrent(hash, shouldDeleteFiles);
    res.json({ status: 'OK', message: result.message });
  } catch (err) {
    console.error(`Error in deleteTorrent controller for hash "${hash}":`, err.message);
    const errorToPass = err instanceof Error ? err : new Error(err.message || 'Failed to delete torrent.');
    // qBittorrent might return 404 if hash not found, 409 if action conflicts, etc.
    errorToPass.status = err.response?.status || 500;
    next(errorToPass);
  }
}