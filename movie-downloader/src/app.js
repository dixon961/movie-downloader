import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import mainRouter from './routes/index.js';
import config from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json()); // For parsing application/json
app.use(express.static(path.resolve(__dirname, '../public'))); // Serve static files

// Routes
app.use(mainRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler caught:", err);
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    status: 'error',
    statusCode: statusCode,
    message: err.message || 'An unexpected error occurred.',
    // ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) // Optionally include stack in dev
  });
});

// Handle 404 for API routes specifically, or all routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ status: 'error', message: 'API endpoint not found.' });
});

// For non-API 404s, you might want to serve index.html for SPAs, or a custom 404 page
// For this app, serving index.html for unknown paths is fine as it's simple.
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../public/index.html'));
});


export default app;