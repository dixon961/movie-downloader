import TelegramBot from 'node-telegram-bot-api';
import config from '../config/index.js';
import * as jackettService from './jackettService.js';
import * as qbittorrentService from './qbittorrentService.js';

const { botToken, allowedUsers } = config.telegram;

const linkMap = new Map(); // shortId -> { link, title }

function isAllowed(userId) {
  if (!allowedUsers || allowedUsers.length === 0) {
    console.warn('Telegram: No allowed users configured. Bot will not respond to any user.');
    return false; // Or true if you want it open by default (not recommended)
  }
  return allowedUsers.includes(Number(userId));
}

export function initializeBot() {
  if (!botToken) {
    console.log('TELEGRAM_BOT_TOKEN not provided. Telegram bot will not be initialized.');
    return null;
  }
  if (allowedUsers.length === 0) {
    console.log('No ALLOWED_USERS for Telegram bot. Bot will be initialized but will not respond to users.');
  }


  const bot = new TelegramBot(botToken, { polling: true });
  console.log('Telegram bot initialized and polling...');

  // 1. Handle search query (any text that is not a command)
  bot.onText(/(.+)/, async (msg, match) => {
    // Ignore if message is a command (starts with /)
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAllowed(userId)) {
      console.log(`Telegram: User ${userId} (${msg.from.username}) is not allowed. Ignoring message: ${msg.text}`);
      // Optionally send a message: bot.sendMessage(chatId, "You are not authorized to use this bot.");
      return;
    }

    const query = match[1];
    console.log(`Telegram: Received search query "${query}" from user ${userId}`);

    try {
      const searchResults = await jackettService.searchTorrents(query);

      if (!searchResults || searchResults.length === 0) {
        bot.sendMessage(chatId, 'No results found for your query.');
        return;
      }

      const buttons = searchResults.slice(0, 10).map((item, index) => {
        const shortId = `id_${index}_${Date.now()}`; // Unique ID for callback
        linkMap.set(shortId, { link: item.link, title: item.title });

        // Message format is preserved
        let shortTitle = item.title; // Original code used full title here
        const buttonText = `[${item.size}] {#${item.seeders || '0'}} ${shortTitle}`;
        return [{ text: buttonText, callback_data: shortId }];
      });

      bot.sendMessage(chatId, 'Select a movie to download:', {
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (error) {
      console.error(`Telegram: Error processing search for "${query}":`, error);
      bot.sendMessage(chatId, 'Sorry, an error occurred while searching.');
    }
  });

  // 2. Handle movie selection (callback query)
  bot.on('callback_query', async qry => {
    const chatId = qry.message.chat.id;
    const userId = qry.from.id;
    const messageId = qry.message.message_id;

    if (!isAllowed(userId)) {
      console.log(`Telegram: User ${userId} (${qry.from.username}) is not allowed for callback_query.`);
      bot.answerCallbackQuery(qry.id, { text: 'You are not authorized.' });
      return;
    }

    const callbackData = qry.data;
    console.log(`Telegram: Received callback_query "${callbackData}" from user ${userId}`);

    // If user pressed "yes" or "no" for confirmation
    if (callbackData.startsWith('yes_') || callbackData.startsWith('no_')) {
      const decision = callbackData.startsWith('yes_') ? 'yes' : 'no';
      const shortId = callbackData.substring(callbackData.indexOf('_') + 1);
      const info = linkMap.get(shortId);

      if (decision === 'yes') {
        if (info && info.link) {
          try {
            await qbittorrentService.addTorrent(info.link);
            // Message format is preserved
            bot.editMessageText('Download started!', { chat_id: chatId, message_id: messageId, reply_markup: null });
            linkMap.delete(shortId); // Clean up
          } catch (error) {
            console.error(`Telegram: Error starting download for "${info.title}":`, error);
            bot.editMessageText('Failed to start download. Please try again or check logs.', { chat_id: chatId, message_id: messageId, reply_markup: null });
          }
        } else {
          bot.editMessageText('Invalid selection or link expired. Please try searching again.', { chat_id: chatId, message_id: messageId, reply_markup: null });
        }
      } else { // User pressed "No"
        // Message format is preserved
        bot.editMessageText('Cancelled. Send a new search query.', { chat_id: chatId, message_id: messageId, reply_markup: null });
        linkMap.delete(shortId); // Clean up
      }
      bot.answerCallbackQuery(qry.id); // Acknowledge the callback query
      return;
    }

    // If user pressed a movie button (initial selection)
    const info = linkMap.get(callbackData);
    if (info) {
      // Message format is preserved
      bot.editMessageText(
        `Full title:\n${info.title}\n\nDOWNLOAD?`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Yes', callback_data: `yes_${callbackData}` },
                { text: '❌ No', callback_data: `no_${callbackData}` }
              ]
            ]
          }
        }
      );
      bot.answerCallbackQuery(qry.id);
    } else {
      bot.answerCallbackQuery(qry.id, { text: 'Invalid selection or selection expired!' });
      bot.editMessageText('Invalid selection or selection expired. Please try searching again.', { chat_id: chatId, message_id: messageId, reply_markup: null });
    }
  });

  bot.on('polling_error', (error) => {
    console.error('Telegram Polling Error:', error.code, error.message);
    // For specific errors like ETELEGRAM, you might want to handle them differently
    // e.g., if (error.code === 'EFATAL') process.exit(1);
  });
  
  return bot;
}