import app from './app.js';
import config from './config/index.js';
import { initializeBot } from './services/telegramService.js';

const PORT = config.port;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`movie-downloader listening on http://0.0.0.0:${PORT}`);
  // Initialize Telegram Bot after server starts
  initializeBot();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  // Perform cleanup if necessary
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  // Perform cleanup if necessary
  process.exit(0);
});