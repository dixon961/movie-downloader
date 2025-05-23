import express from 'express';
import apiRoutes from './apiRoutes.js';

const router = express.Router();

router.use('/api', apiRoutes);

// Could add other top-level route groups here if needed

export default router;