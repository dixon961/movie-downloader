import express from 'express';
import multer from 'multer';
import * as searchController from '../controllers/searchController.js';
import * as downloadController from '../controllers/downloadController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/search', searchController.search);
router.post('/download', downloadController.download);
router.post('/download/upload', upload.single('torrent'), downloadController.uploadTorrent);
router.get('/download/status', downloadController.getDownloadStatus);
router.delete('/download/torrent/:hash', downloadController.deleteTorrent);

export default router;