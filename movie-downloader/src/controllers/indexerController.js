import config from '../config/index.js';

export function getIndexers(req, res, next) {
  // Return the list of indexers from the configuration
  // Ensure 'all' is handled appropriately if it's the only one configured
  const indexers = config.jackett.indexers;
  
  // If the only configured indexer is 'all', we might want to return it as is,
  // or perhaps an empty array if the user is expected to configure specific ones.
  // For now, let's return whatever is in the config.
  res.json(indexers);
}
