import express from 'express';
import * as searchController from '../controllers/searchController.js';
import * as downloadController from '../controllers/downloadController.js';
import * as indexerController from '../controllers/indexerController.js'; // Import the new controller

const router = express.Router();

router.get('/search', searchController.search);
router.post('/download', downloadController.download);
router.get('/download/status', downloadController.getDownloadStatus);
router.delete('/download/torrent/:hash', downloadController.deleteTorrent);

// Add the new route for fetching indexers
router.get('/indexers', indexerController.getIndexers);

export default router;
