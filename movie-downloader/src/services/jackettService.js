import axios from 'axios';
import config from '../config/index.js';
import { formatSize } from '../utils/formatters.js';

// Ensure config.jackett is defined, and then destructure
const jackettConfig = config.jackett || {};
const { 
    baseUrl = 'http://localhost:9117/api/v2.0/indexers', // Default if not in config
    apiKey = '', 
    indexers: configuredIndexers = ['all'] // Default to 'all' if not specified
} = jackettConfig;

// Modified searchTorrents function to accept an optional indexerId
export async function searchTorrents(query, indexerId = null) {
  if (!apiKey) {
    console.error('Jackett API key is not configured. Search will fail.');
    return []; // Return empty or throw error
  }
  if (!baseUrl) {
    console.error('Jackett base URL is not configured. Search will fail.');
    return [];
  }

  const allResults = [];
  
  // Determine which indexers to query
  const indexersToQuery = indexerId ? (indexerId === 'all' ? configuredIndexers : [indexerId]) : configuredIndexers;

  // If the configured indexers are ['all'], and the user explicitly selected 'all',
  // we should still query all configured indexers.
  // If the user explicitly selected 'all', and configuredIndexers is NOT ['all'],
  // we should query all configured indexers.
  // If indexerId is null or undefined, we query all configured indexers.
  // If indexerId is a specific indexer name, we query only that one.

  // Let's refine the logic:
  let targetIndexers;
  if (indexerId === null || indexerId === 'all') {
      // If user wants 'all' or no specific indexer is given, use all configured indexers.
      // If 'all' is in configuredIndexers, it means Jackett's /all/results endpoint is intended.
      // However, the API path is /api/v2.0/indexers/{indexerId}/results.
      // So, if configuredIndexers is ['all'], we should query /api/v2.0/indexers/all/results.
      // If configuredIndexers is ['indexer1', 'indexer2'] and user selects 'all', we query both.
      if (configuredIndexers.length === 1 && configuredIndexers[0] === 'all') {
          targetIndexers = ['all']; // Use Jackett's aggregate endpoint
      } else {
          targetIndexers = configuredIndexers; // Query each configured indexer individually
      }
  } else {
      // User specified a single indexer
      targetIndexers = [indexerId];
  }

  await Promise.all(targetIndexers.map(async idx => {
    // Construct the URL based on the indexer ID
    const url = `${baseUrl}/${idx}/results`;

    const params = {
      apikey: apiKey,
      Query: query,
      _: Date.now() // Cache buster
    };

    console.log(`Jackett: Querying URL: ${url} with params:`, params); // Debug log

    try {
      const { data } = await axios.get(url, { params });

      if (data && data.Results) {
        data.Results.forEach(r => {
          allResults.push({
            title: r.Title,
            size: formatSize(r.Size),
            link: r.MagnetUri || r.Link,
            seeders: r.Seeders || 0,
            peers: r.Peers || 0,
            indexer: r.Tracker || idx, // Use Tracker name if available, else the queried indexer ID
            publishDate: r.PublishDate,
          });
        });
      } else {
        console.warn(`Jackett: No results in data for indexer ${idx} and query "${query}". Data:`, data);
      }
    } catch (error) {
      let errorMessage = `Error searching Jackett indexer ${idx} for query "${query}": `;
      if (error.response) {
        errorMessage += `Status ${error.response.status} - ${error.response.statusText}. `;
        errorMessage += `Data: ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        errorMessage += `No response received. Request: ${JSON.stringify(error.request)}`;
      } else {
        errorMessage += `Error message: ${error.message}`;
      }
      console.error(errorMessage);
    }
  }));

  allResults.sort((a, b) => b.seeders - a.seeders);
  return allResults.slice(0, 25);
}
