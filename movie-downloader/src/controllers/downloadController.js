import * as qbittorrentService from '../services/qbittorrentService.js';

export async function download(req, res, next) {
  const { link } = req.body;
  if (!link) {
    return res.status(400).json({ error: 'Link parameter "link" is required in the body.' });
  }

  try {
    const result = await qbittorrentService.addTorrent(link);
    res.json({ status: 'OK', message: result.message }); // API response remains { status: 'OK' }
  } catch (err) {
    console.error(`Error in download controller for link "${link}":`, err.response?.data || err.message);
    // Ensure the error passed to next is an actual Error object
    const errorToPass = err instanceof Error ? err : new Error(err.message || 'Failed to download torrent');
    errorToPass.status = err.response?.status || 500;
    next(errorToPass); // Pass to global error handler
  }
}