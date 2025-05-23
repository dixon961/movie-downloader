import axios from 'axios';
import config from '../config/index.js';
import { formatSize } from '../utils/formatters.js';

// Ensure config.jackett is defined, and then destructure
const jackettConfig = config.jackett || {};
const { 
    baseUrl = 'http://localhost:9117/api/v2.0/indexers', // Default if not in config
    apiKey = '', 
    indexers: configIndexers = ['all'] 
} = jackettConfig;

export async function searchTorrents(query) {
  if (!apiKey) {
    console.error('Jackett API key is not configured. Search will fail.');
    return []; // Return empty or throw error
  }
  if (!baseUrl) {
    console.error('Jackett base URL is not configured. Search will fail.');
    return [];
  }


  const allResults = [];
  const effectiveIndexers = configIndexers.includes('all') ? ['all'] : configIndexers;

  await Promise.all(effectiveIndexers.map(async idx => {
    // Reverting to the original path structure, without .json
    // The full URL will be like: JACKETT_BASE_URL/all/results?apikey=...&Query=...
    // or JACKETT_BASE_URL/indexerId/results?apikey=...&Query=...
    const url = `${baseUrl}/${idx}/results`; // <--- REVERTED THIS LINE

    const params = {
      apikey: apiKey,
      Query: query,
      // Jackett often uses 't=search' for Torznab queries, but for this direct API path,
      // it might not be needed or might even conflict. Let's stick to what was implied.
      // Adding a cache buster is generally good practice.
      _: Date.now()
    };

    // The original code also had PageSize: 50.
    // This parameter might not be supported on the /api/v2.0/indexers/{id}/results endpoint.
    // It's more common with the general /api/v2.0/results (Torznab) endpoint.
    // Let's try without it first to simplify. If results are too few, we can investigate.
    // params.PageSize = 50;

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
            indexer: r.Tracker || idx,
            publishDate: r.PublishDate,
          });
        });
      } else {
        console.warn(`Jackett: No results in data for indexer ${idx} and query "${query}". Data:`, data);
      }
    } catch (error) {
      let errorMessage = `Error searching Jackett indexer ${idx} for query "${query}": `;
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        errorMessage += `Status ${error.response.status} - ${error.response.statusText}. `;
        errorMessage += `Data: ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        // The request was made but no response was received
        errorMessage += `No response received. Request: ${JSON.stringify(error.request)}`;
      } else {
        // Something happened in setting up the request that triggered an Error
        errorMessage += `Error message: ${error.message}`;
      }
      console.error(errorMessage);
      // Optionally, rethrow or handle to inform the user
    }
  }));

  allResults.sort((a, b) => b.seeders - a.seeders);
  return allResults.slice(0, 25);
}