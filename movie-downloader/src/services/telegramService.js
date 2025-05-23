import TelegramBot from 'node-telegram-bot-api';
import config from '../config/index.js';
import * as jackettService from './jackettService.js';
import * as qbittorrentService from './qbittorrentService.js'; // Ensure this is imported

const { botToken, allowedUsers } = config.telegram;

const linkMap = new Map(); // shortId -> { link, title }

// Store user state, e.g., if they are expecting to type a search query
const userState = new Map(); // userId -> 'awaiting_search_query'

function isAllowed(userId) {
  if (!allowedUsers || allowedUsers.length === 0) {
    console.warn('Telegram: No allowed users configured. Bot will not respond to any user.');
    return false;
  }
  return allowedUsers.includes(Number(userId));
}

// Function to send main menu
function sendMainMenu(chatId, text = "👋 Hello! How can I help you today?") {
  bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔍 Search for Media', callback_data: 'action_search' }],
        [{ text: '📊 View Download Status', callback_data: 'action_status' }]
      ]
    }
  });
}


let bot; // Declare bot instance variable

export function initializeBot() {
  if (!botToken) {
    console.log('TELEGRAM_BOT_TOKEN not provided. Telegram bot will not be initialized.');
    return null;
  }
  if (allowedUsers.length === 0) {
    console.log('No ALLOWED_USERS for Telegram bot. Bot will be initialized but will not respond to users.');
  }

  bot = new TelegramBot(botToken, { polling: true }); // Assign to the outer scope variable
  console.log('Telegram bot initialized and polling...');

  // Command to show the main menu
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAllowed(userId)) return;
    userState.delete(userId); // Clear any pending state
    sendMainMenu(chatId);
  });

  // Handle text messages for search (if user is in 'awaiting_search_query' state)
  bot.on('message', async (msg) => {
    // Ignore if it's a command handled by onText or if user is not in search state
    if (msg.text && msg.text.startsWith('/') || !userState.has(msg.from.id) || userState.get(msg.from.id) !== 'awaiting_search_query') {
      // If user sends random text not in search mode, and not /start, maybe resend menu or ignore
      if (msg.text && !msg.text.startsWith('/') && !userState.has(msg.from.id)) {
        // sendMainMenu(msg.chat.id, "🤔 I didn't understand that. Please choose an option or type /start.");
      }
      return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAllowed(userId)) return;

    const query = msg.text;
    userState.delete(userId); // Clear state after getting query

    bot.sendMessage(chatId, `⏳ Searching for "${query}"... please wait.`);
    console.log(`Telegram: Received search query "${query}" from user ${userId}`);

    try {
      const searchResults = await jackettService.searchTorrents(query);

      if (!searchResults || searchResults.length === 0) {
        bot.sendMessage(chatId, `🤷 Oops! No results found for "${query}". Try a different search term?`);
        sendMainMenu(chatId, "What would you like to do next?");
        return;
      }

      const buttons = searchResults.slice(0, 10).map((item, index) => {
        const shortId = `dl_${index}_${Date.now()}`; // Prefix for download items
        linkMap.set(shortId, { link: item.link, title: item.title });
        // More user-friendly button text
        const buttonText = `[${item.size}] S:${item.seeders || '0'} P:${item.peers || '0'} - ${item.title.substring(0, 40)}${item.title.length > 40 ? '...' : ''}`;
        return [{ text: buttonText, callback_data: shortId }];
      });

      bot.sendMessage(chatId, '✨ Here are the top results. Select one to see more details:', {
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (error) {
      console.error(`Telegram: Error processing search for "${query}":`, error);
      bot.sendMessage(chatId, '❌ Sorry, an error occurred while searching. Please try again later.');
      sendMainMenu(chatId, "What would you like to do next?");
    }
  });

  // Handle callback queries (button presses)
  bot.on('callback_query', async qry => {
    const chatId = qry.message.chat.id;
    const userId = qry.from.id;
    const messageId = qry.message.message_id;
    const callbackData = qry.data;

    if (!isAllowed(userId)) {
      bot.answerCallbackQuery(qry.id, { text: '🚫 You are not authorized.' });
      return;
    }

    console.log(`Telegram: Received callback_query "${callbackData}" from user ${userId}`);
    bot.answerCallbackQuery(qry.id); // Acknowledge immediately

    // Main Actions
    if (callbackData === 'action_search') {
      userState.set(userId, 'awaiting_search_query');
      bot.editMessageText("✍️ Okay, type your search query now:", { chat_id: chatId, message_id: messageId, reply_markup: null });
      return;
    }

    if (callbackData === 'action_status') {
      bot.editMessageText("⏳ Fetching download statuses...", { chat_id: chatId, message_id: messageId, reply_markup: null });
      try {
        const statuses = await qbittorrentService.getTorrentsInfo();
        if (!statuses || statuses.length === 0) {
          bot.sendMessage(chatId, "🤷 No active downloads found right now.");
        } else {
          let statusMessage = "📊 Current Download Statuses:\n\n";
          statuses.forEach(s => {
            statusMessage += `🎬 *${s.name}*\n`;
            statusMessage += `💾 Size: ${s.size}\n`;
            statusMessage += `📈 Progress: ${s.progress}%\n`;
            statusMessage += `🚦 Status: ${s.status}\n\n`;
          });
          bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        console.error('Telegram: Error fetching download statuses:', error);
        bot.sendMessage(chatId, '❌ Sorry, an error occurred while fetching download statuses.');
      }
      // After showing status, resend main menu for next action
      sendMainMenu(chatId, "What would you like to do next?");
      // Delete the "Fetching..." message if you want, or let it be replaced by sendMainMenu's new message
      // bot.deleteMessage(chatId, messageId); // Optional: if you want to remove the "Fetching..." message
      return;
    }

    // Download item selection / confirmation
    if (callbackData.startsWith('dl_')) { // A specific torrent result was clicked
      const info = linkMap.get(callbackData);
      if (info) {
        bot.editMessageText(
          `🎬 You selected:\n*${info.title}*\n\nDo you want to start the download?`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Yes, Download!', callback_data: `confirm_yes_${callbackData}` },
                  { text: '❌ No, Cancel', callback_data: `confirm_no_${callbackData}` }
                ]
              ]
            }
          }
        );
      } else {
        bot.editMessageText('⚠️ Invalid selection or it has expired. Please try searching again.', { chat_id: chatId, message_id: messageId, reply_markup: null });
        sendMainMenu(chatId, "What would you like to do next?");
      }
      return;
    }

    // Confirmation for download
    if (callbackData.startsWith('confirm_yes_') || callbackData.startsWith('confirm_no_')) {
      const decision = callbackData.startsWith('confirm_yes_') ? 'yes' : 'no';
      const originalCallbackData = callbackData.substring(callbackData.indexOf('_', callbackData.indexOf('_') + 1) + 1); // e.g., dl_...
      const info = linkMap.get(originalCallbackData);

      if (decision === 'yes') {
        if (info && info.link) {
          try {
            bot.editMessageText(`⏳ Starting download for:\n*${info.title}*`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: null });
            await qbittorrentService.addTorrent(info.link);
            bot.sendMessage(chatId, `✅ Download started for *${info.title}*!\nYou can check the status using the main menu.`, { parse_mode: 'Markdown'});
            linkMap.delete(originalCallbackData);
          } catch (error) {
            console.error(`Telegram: Error starting download for "${info.title}":`, error);
            bot.sendMessage(chatId, `❌ Failed to start download for *${info.title}*. Please try again or check logs.`, { parse_mode: 'Markdown'});
          }
        } else {
          bot.editMessageText('⚠️ Invalid selection or link expired. Please try searching again.', { chat_id: chatId, message_id: messageId, reply_markup: null });
        }
      } else { // User pressed "No"
        bot.editMessageText('👍 Download cancelled. What would you like to do next?', { chat_id: chatId, message_id: messageId, reply_markup: null });
        linkMap.delete(originalCallbackData);
      }
      sendMainMenu(chatId, "What would you like to do next?");
      return;
    }

    // Fallback for unknown callback data
    console.warn(`Telegram: Unhandled callback_data: ${callbackData}`);
    bot.editMessageText("🤔 I'm not sure what to do with that. Let's start over.", { chat_id: chatId, message_id: messageId, reply_markup: null });
    sendMainMenu(chatId);
  });

  bot.on('polling_error', (error) => {
    console.error('Telegram Polling Error:', error.code, error.message);
  });
  
  console.log("Telegram bot event handlers registered.");
  return bot;
}