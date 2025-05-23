import dotenv from 'dotenv';
dotenv.config(); // Load .env file

const config = {
  port: process.env.PORT || 9339,
  jackett: {
    baseUrl: process.env.JACKETT_BASE_URL || 'http://localhost:9117/api/v2.0/indexers',
    apiKey: process.env.JACKETT_API_KEY || '',
    indexers: (process.env.JACKETT_INDEXERS || 'all')
                .split(',')
                .map(i => i.trim()),
  },
  qbittorrent: {
    url: process.env.QB_URL || 'http://localhost:8080',
    user: process.env.QB_USER || '',
    pass: process.env.QB_PASS || '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedUsers: (process.env.ALLOWED_USERS || '')
                    .split(',')
                    .map(id => Number(id.trim()))
                    .filter(id => !isNaN(id) && id !== 0),
  },
  // Base URL for the application, used by Telegram bot if it were to call own API
  // For this refactor, Telegram service calls other services directly.
  // appBaseUrl: `http://localhost:${process.env.PORT || 9339}`
};

// Basic validation for critical configs
if (!config.jackett.apiKey) {
  console.warn('Warning: JACKETT_API_KEY is not set. Jackett search will likely fail.');
}
if (!config.qbittorrent.user || !config.qbittorrent.pass) {
  console.warn('Warning: QB_USER or QB_PASS is not set. qBittorrent functionality will likely fail.');
}
if (!config.telegram.botToken && config.telegram.allowedUsers.length > 0) {
  console.warn('Warning: TELEGRAM_BOT_TOKEN is not set, but ALLOWED_USERS are. Telegram bot will not run.');
}


export default config;