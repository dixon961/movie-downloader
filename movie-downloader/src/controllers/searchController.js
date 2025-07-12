import * as jackettService from '../services/jackettService.js';

export async function search(req, res, next) {
  const { q, indexer } = req.query; // Get both query and optional indexer
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  try {
    // Pass the indexer parameter to the service
    const results = await jackettService.searchTorrents(q, indexer);
    res.json(results);
  } catch (err) {
    console.error(`Error in search controller for query "${q}" and indexer "${indexer}":`, err);
    next(err); // Pass to global error handler
  }
}
