import express from 'express';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import tough from 'tough-cookie';
import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const {
  JACKETT_URL,
  QB_URL,
  QB_USER,
  QB_PASS,
  TELEGRAM_BOT_TOKEN
} = process.env;

const jar    = new tough.CookieJar();
const client = wrapper(axios.create({
  baseURL:    QB_URL,
  jar,
  withCredentials: true,
}));

function formatSize(bytes) {
  if (bytes === 0 || isNaN(bytes)) return 'Unknown';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

app.get('/api/search', async (req, res, next) => {
  const { q } = req.query;
  const apiKey    = process.env.JACKETT_API_KEY;
  const baseUrl   = process.env.JACKETT_BASE_URL;
  const indexers  = (process.env.JACKETT_INDEXERS || 'all')
                     .split(',')
                     .map(i => i.trim());

  try {
    const allResults = [];
    await Promise.all(indexers.map(async idx => {
      const url = `${baseUrl}/${idx}/results`;
      const { data } = await axios.get(url, {
        params: {
          apikey: apiKey,
          Query: q,
          PageSize: 50
        }
      });
      if (data && data.Results) {
        data.Results.forEach(r => {
          allResults.push({
            title: r.Title,
            size: formatSize(r.Size),
            link: r.MagnetUri || r.Link,
            seeders: r.Seeders || 0,
            indexer: idx
          });
        });
      }
    }));

    allResults.sort((a, b) => b.seeders - a.seeders);
    res.json(allResults.slice(0, 25));
  } catch (err) {
    next(err);
  }
});

// 2) Download endpoint
app.post('/api/download', async (req, res, next) => {
  const { link } = req.body;
  try {
    console.log('Authenticating with qBittorrent...');

    const loginResp = await client.post(
      '/api/v2/auth/login',
      new URLSearchParams({ username: QB_USER, password: QB_PASS }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    if (loginResp.data !== 'Ok.') {
      throw new Error(`Login failed: ${loginResp.data}`);
    }

    console.log('Sending link to qBittorrent:', link);
    const addResp = await client.post(
      '/api/v2/torrents/add',
      new URLSearchParams({ urls: link }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    console.log('Add torrent response:', addResp.status, addResp.data);
    res.json({ status: 'OK' });
  } catch (err) {
    console.error('Error in download endpoint:', err.response?.data || err.message);
    next(err);
  }
});

// 3) Telegram bot
if (TELEGRAM_BOT_TOKEN) {
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  const linkMap = new Map(); // To store the mapping of short IDs to links

  bot.onText(/(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1];
    const { data } = await axios.get(`http://localhost:9339/api/search`, { params: { q: query } });

    // Pick first 5 and create a short ID for each
    const buttons = data.slice(0, 5).map((item, index) => {
      const shortId = `id_${index}_${Date.now()}`; // Create a unique short ID
      linkMap.set(shortId, item.link); // Store the mapping
      const buttonText = `[${item.size}] ${item.title}`;
      return [{
        text: buttonText,
        callback_data: shortId
      }];
    });

    bot.sendMessage(chatId, 'Select a movie to download:', {
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.on('callback_query', async qry => {
    const link = linkMap.get(qry.data); // Retrieve the actual link using the short ID
    if (link) {
      await axios.post(`http://localhost:9339/api/download`, { link });
      bot.answerCallbackQuery(qry.id, { text: 'Download started!' });
    } else {
      bot.answerCallbackQuery(qry.id, { text: 'Invalid selection!' });
    }
  });
}

app.listen(9339, () => {
  console.log('movie-downloader listening on http://0.0.0.0:9339');
});
