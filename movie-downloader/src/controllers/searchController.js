import * as jackettService from '../services/jackettService.js';

export async function search(req, res, next) {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  try {
    const results = await jackettService.searchTorrents(q);
    res.json(results);
  } catch (err) {
    console.error(`Error in search controller for query "${q}":`, err);
    next(err); // Pass to global error handler
  }
}