import express from 'express';
import * as searchController from '../controllers/searchController.js';
import * as downloadController from '../controllers/downloadController.js';

const router = express.Router();

router.get('/search', searchController.search);
router.post('/download', downloadController.download);

export default router;