import TelegramBot from 'node-telegram-bot-api';
import config from '../config/index.js';
import * as jackettService from './jackettService.js';
import * as qbittorrentService from './qbittorrentService.js';

const { botToken, allowedUsers } = config.telegram;

const linkMap = new Map(); // shortId -> { link, title } for search results
const userState = new Map(); // userId -> 'awaiting_search_query' or other states

let bot; // Declare bot instance variable globally in this module

function isAllowed(userId) {
  if (!allowedUsers || allowedUsers.length === 0) {
    console.warn('Telegram: No allowed users configured. Bot will not respond to any user.');
    return false;
  }
  return allowedUsers.includes(Number(userId));
}

// Function to send main menu
function sendMainMenu(chatId, text = "👋 Hello! How can I assist you today?") {
  if (!bot) {
    console.error("Telegram Bot not initialized when trying to send main menu.");
    return;
  }
  bot.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔍 Search for Media', callback_data: 'action_search' }],
        [{ text: '📊 View Download Status', callback_data: 'action_status' }]
      ]
    }
  });
}

export function initializeBot() {
  if (!botToken) {
    console.log('TELEGRAM_BOT_TOKEN not provided. Telegram bot will not be initialized.');
    return null;
  }
  if (allowedUsers.length === 0) {
    console.log('No ALLOWED_USERS for Telegram bot. Bot will be initialized but will not respond to users.');
    // Bot will still run but isAllowed will prevent actions
  }

  bot = new TelegramBot(botToken, { polling: true });
  console.log('Telegram bot initialized and polling...');

  // Command to show the main menu
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAllowed(userId)) {
        bot.sendMessage(chatId, "🚫 Sorry, you are not authorized to use this bot.");
        return;
    }
    userState.delete(userId); // Clear any pending state
    sendMainMenu(chatId);
  });

  // Command to cancel current operation (like search)
  bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (!isAllowed(userId)) return;

    if (userState.has(userId)) {
        userState.delete(userId);
        bot.sendMessage(chatId, "👍 Operation cancelled.");
    }
    sendMainMenu(chatId, "What would you like to do now?");
  });


  // Handle text messages for search (if user is in 'awaiting_search_query' state)
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) { // Ignore commands and non-text messages here
        return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAllowed(userId)) return; // Silently ignore if not allowed and not /start

    if (userState.get(userId) !== 'awaiting_search_query') {
      // If user sends random text not in search mode, maybe resend menu or ignore
      // sendMainMenu(chatId, "🤔 I didn't understand that. Please choose an option or type /start or /cancel.");
      return;
    }

    const query = msg.text;
    userState.delete(userId); // Clear state after getting query

    await bot.sendMessage(chatId, `⏳ Searching for "${query}"... please wait.`);
    console.log(`Telegram: Received search query "${query}" from user ${userId}`);

    try {
      const searchResults = await jackettService.searchTorrents(query);

      if (!searchResults || searchResults.length === 0) {
        await bot.sendMessage(chatId, `🤷 Oops! No results found for "${query}". Try a different search term?`);
        sendMainMenu(chatId, "What would you like to do next?");
        return;
      }

      const buttons = searchResults.slice(0, 10).map((item, index) => {
        const shortId = `dl_item_${index}_${Date.now()}`; // Prefix for download items
        linkMap.set(shortId, { link: item.link, title: item.title });
        const buttonText = `[${item.size}] S:${item.seeders || '0'} P:${item.peers || '0'} - ${item.title.substring(0, 35)}${item.title.length > 35 ? '...' : ''}`;
        return [{ text: buttonText, callback_data: shortId }];
      });

      await bot.sendMessage(chatId, '✨ Here are the top results. Select one to see more details:', {
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (error) {
      console.error(`Telegram: Error processing search for "${query}":`, error);
      await bot.sendMessage(chatId, '❌ Sorry, an error occurred while searching. Please try again later.');
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
      await bot.answerCallbackQuery(qry.id, { text: '🚫 You are not authorized.' });
      return;
    }

    console.log(`Telegram: User ${userId} pressed button with callback_data: "${callbackData}" on message ${messageId}`);

    // --- Main Actions ---
    if (callbackData === 'action_search') {
      await bot.answerCallbackQuery(qry.id);
      userState.set(userId, 'awaiting_search_query');
      try {
        await bot.editMessageText("✍️ Okay, type your search query now (or send /cancel to go back):", { chat_id: chatId, message_id: messageId, reply_markup: null });
      } catch (e) { console.error("Error editing message for search prompt:", e.message); /* Could be already deleted */ }
      return;
    }

    if (callbackData === 'action_status') {
      await bot.answerCallbackQuery(qry.id);
      try {
        await bot.editMessageText("⏳ Fetching download statuses...", { chat_id: chatId, message_id: messageId, reply_markup: null });
      } catch (e) { console.error("Error editing message for status fetch:", e.message); }
      
      try {
        const statuses = await qbittorrentService.getTorrentsInfo();
        // Delete the "Fetching..." message before sending new ones for status
        try { await bot.deleteMessage(chatId, messageId); } catch (e) { /* ignore if already deleted */ }

        if (!statuses || statuses.length === 0) {
          await bot.sendMessage(chatId, "🤷 No active or recent downloads found right now.");
        } else {
          await bot.sendMessage(chatId, "📊 Current Download Statuses (click to delete):");
          for (const s of statuses) {
            let statusEntry = `🎬 *${s.name}*\n`;
            statusEntry += `💾 Size: ${s.size}, Progress: ${s.progress}%\n`;
            statusEntry += `🚦 Status: ${s.status}`;
            
            await bot.sendMessage(chatId, statusEntry, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: `🗑️ Delete (with files)`, callback_data: `del_torrent_${s.hash}` }]
                ]
              }
            });
          }
        }
      } catch (error) {
        console.error('Telegram: Error fetching/displaying download statuses:', error);
        await bot.sendMessage(chatId, '❌ Sorry, an error occurred while fetching download statuses.');
      }
      sendMainMenu(chatId, "What would you like to do next?");
      return;
    }

    // --- Torrent Deletion Flow ---
    if (callbackData.startsWith('del_torrent_')) { // Initial "Delete" button from status list
      const hash = callbackData.substring('del_torrent_'.length);
      // Attempt to get name from the message text itself (qry.message.text)
      const torrentName = qry.message.text.split('\n')[0].replace('🎬 *', '').replace('*','').trim() || `Torrent (hash: ${hash.substring(0,8)}...)`;

      await bot.answerCallbackQuery(qry.id);
      try {
        await bot.editMessageText(
          `Are you sure you want to delete:\n*${torrentName}*\nand all its downloaded files? This cannot be undone.`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Yes, Delete Files!', callback_data: `del_confirm_yes_${hash}` },
                  { text: '❌ No, Keep It', callback_data: `del_confirm_no_${hash}` }
                ]
              ]
            }
          }
        );
      } catch (e) { console.error("Error editing message for delete confirmation:", e.message); }
      return;
    }

    if (callbackData.startsWith('del_confirm_yes_') || callbackData.startsWith('del_confirm_no_')) { // Confirmation for deletion
      const decision = callbackData.startsWith('del_confirm_yes_');
      const hash = callbackData.substring(callbackData.lastIndexOf('_') + 1);
      
      await bot.answerCallbackQuery(qry.id);

      if (decision) { // Yes, delete
        try {
          await bot.editMessageText(`⏳ Deleting torrent (hash: ${hash.substring(0,8)}...) and its files...`, {
            chat_id: chatId, message_id: messageId, reply_markup: null, parse_mode: 'Markdown'
          });
          await qbittorrentService.deleteTorrent(hash, true); // true to delete files
          await bot.editMessageText(`✅ Torrent (hash: ${hash.substring(0,8)}...) and its files have been successfully deleted.`, {
            chat_id: chatId, message_id: messageId, reply_markup: null, parse_mode: 'Markdown'
          });
        } catch (error) {
          console.error(`Telegram: Error deleting torrent ${hash}:`, error);
          await bot.editMessageText(`❌ Failed to delete torrent (hash: ${hash.substring(0,8)}...). Error: ${error.message}`, {
            chat_id: chatId, message_id: messageId, reply_markup: null, parse_mode: 'Markdown'
          });
        }
      } else { // No, cancel deletion
        await bot.editMessageText('👍 Deletion cancelled. The torrent was not removed.', {
          chat_id: chatId, message_id: messageId, reply_markup: null
        });
      }
      sendMainMenu(chatId, "What would you like to do next?");
      return;
    }

    // --- Search Result Download Flow ---
    if (callbackData.startsWith('dl_item_')) { // A specific search result was clicked
      await bot.answerCallbackQuery(qry.id);
      const info = linkMap.get(callbackData);
      if (info) {
        try {
          await bot.editMessageText(
            `🎬 You selected:\n*${info.title}*\n\nDo you want to start the download?`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Yes, Download!', callback_data: `dl_confirm_yes_${callbackData}` }, // Note: callbackData here is dl_item_...
                    { text: '❌ No, Cancel', callback_data: `dl_confirm_no_${callbackData}` }
                  ]
                ]
              }
            }
          );
        } catch (e) { console.error("Error editing message for download item confirmation:", e.message); }
      } else {
        try {
          await bot.editMessageText('⚠️ Invalid selection or it has expired. Please try searching again.', { chat_id: chatId, message_id: messageId, reply_markup: null });
        } catch (e) { console.error("Error editing message for invalid dl_item selection:", e.message); }
        sendMainMenu(chatId, "What would you like to do next?");
      }
      return;
    }

    if (callbackData.startsWith('dl_confirm_yes_') || callbackData.startsWith('dl_confirm_no_')) { // Confirmation for adding download
      const decision = callbackData.startsWith('dl_confirm_yes_');
      // Extract the original 'dl_item_...' part
      const originalDlCallbackData = callbackData.substring(callbackData.indexOf('dl_item_')); 
      const info = linkMap.get(originalDlCallbackData);
      
      await bot.answerCallbackQuery(qry.id);

      if (decision) {
        if (info && info.link) {
          try {
            await bot.editMessageText(`⏳ Starting download for:\n*${info.title}*`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: null });
            await qbittorrentService.addTorrent(info.link);
            // Send a new message for confirmation, as the previous one is edited
            await bot.sendMessage(chatId, `✅ Download started for *${info.title}*!\nYou can check the status using the main menu.`, { parse_mode: 'Markdown'});
            linkMap.delete(originalDlCallbackData); // Clean up
             // Delete the "Starting download..." message after sending the success message
            try { await bot.deleteMessage(chatId, messageId); } catch(e) { /* ignore */ }
          } catch (error) {
            console.error(`Telegram: Error starting download for "${info.title}":`, error);
            await bot.sendMessage(chatId, `❌ Failed to start download for *${info.title}*. Error: ${error.message}`, { parse_mode: 'Markdown'});
            try { await bot.deleteMessage(chatId, messageId); } catch(e) { /* ignore */ }
          }
        } else {
          try {
            await bot.editMessageText('⚠️ Invalid selection or link expired. Please try searching again.', { chat_id: chatId, message_id: messageId, reply_markup: null });
          } catch (e) { console.error("Error editing message for invalid dl_confirm selection:", e.message); }
        }
      } else { // User pressed "No" to download
        try {
          await bot.editMessageText('👍 Download cancelled. What would you like to do next?', { chat_id: chatId, message_id: messageId, reply_markup: null });
        } catch (e) { console.error("Error editing message for dl_confirm_no:", e.message); }
        linkMap.delete(originalDlCallbackData); // Clean up
      }
      sendMainMenu(chatId, "What would you like to do next?");
      return;
    }

    // Fallback for unhandled callback data
    console.warn(`Telegram: Unhandled callback_data: ${callbackData} from user ${userId} on message ${messageId}`);
    await bot.answerCallbackQuery(qry.id, { text: "🤔 Action unclear or expired."});
    // Optionally, try to edit the message if it's an old interaction
    // try {
    //   await bot.editMessageText("This interaction has expired or is unclear. Please use /start.", { chat_id: chatId, message_id: messageId, reply_markup: null });
    // } catch (e) { /* ignore if cannot edit */ }
  });

  bot.on('polling_error', (error) => {
    console.error('Telegram Polling Error:', error.code, error.message);
    // Add more specific handling if needed, e.g., for ETELEGRAM, ECONNRESET
  });
  
  console.log("Telegram bot event handlers fully registered.");
  return bot;
}