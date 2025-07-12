import TelegramBot from 'node-telegram-bot-api';
import config from '../config/index.js';
import * as jackettService from './jackettService.js';
import * as qbittorrentService from './qbittorrentService.js';

const { botToken, allowedUsers } = config.telegram;
const jackettConfig = config.jackett || {};
const availableIndexers = jackettConfig.indexers && jackettConfig.indexers.length > 0 ? jackettConfig.indexers : ['all'];

const linkMap = new Map(); // shortId -> { link, title } for search results
// User state now needs to store selected indexer
// userId -> { state: 'awaiting_search_query' | 'awaiting_indexer_selection', selectedIndexer: 'indexerName' | null }
const userState = new Map(); 

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

// Function to send indexer selection menu
function sendIndexerSelectionMenu(chatId) {
  if (!bot) {
    console.error("Telegram Bot not initialized when trying to send indexer selection menu.");
    return;
  }
  const buttons = availableIndexers.map(indexer => {
    return [{ text: indexer === 'all' ? 'All Indexers' : indexer, callback_data: `select_indexer_${indexer}` }];
  });
  
  // Add a cancel option
  buttons.push([{ text: '❌ Cancel', callback_data: 'action_cancel_indexer_selection' }]);

  bot.sendMessage(chatId, "🌐 Please select an indexer to search:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

export function initializeBot() {
  if (!botToken) {
    console.log('TELEGRAM_BOT_TOKEN not provided. Telegram bot will not be initialized.');
    return null;
  }
  if (allowedUsers.length === 0) {
    console.log('No ALLOWED_USERS for Telegram bot. Bot will be initialized but will not respond to users.');
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
    userState.delete(userId); 
    sendMainMenu(chatId);
  });

  // Command to cancel current operation
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


  // Handle text messages for search
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) { 
        return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAllowed(userId)) return; 

    const currentState = userState.get(userId);

    // Handle search query input
    if (currentState && currentState.state === 'awaiting_search_query') {
      const query = msg.text;
      const selectedIndexer = currentState.selectedIndexer; // Get the indexer from user state

      // Clear state for this user after processing the query
      userState.delete(userId); 

      await bot.sendMessage(chatId, `⏳ Searching for "${query}"${selectedIndexer && selectedIndexer !== 'all' ? ` using "${selectedIndexer}"` : ''}... please wait.`);
      console.log(`Telegram: Received search query "${query}"${selectedIndexer && selectedIndexer !== 'all' ? ` for indexer "${selectedIndexer}"` : ''} from user ${userId}`);

      try {
        // Pass the selected indexer to the search function
        const searchResults = await jackettService.searchTorrents(query, selectedIndexer);

        if (!searchResults || searchResults.length === 0) {
          await bot.sendMessage(chatId, `🤷 Oops! No results found for "${query}"${selectedIndexer && selectedIndexer !== 'all' ? ` on "${selectedIndexer}"` : ''}. Try a different search term or indexer?`);
          // After no results, directly offer to search again or go to main menu
          bot.sendMessage(chatId, "What would you like to do?", {
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '🔄 Search Again', callback_data: 'action_search' }],
                      [{ text: '🏠 Main Menu', callback_data: 'action_main_menu' }]
                  ]
              }
          });
          return;
        }

        const buttons = searchResults.slice(0, 10).map((item, index) => {
          const shortId = `dl_item_${index}_${Date.now()}`; 
          linkMap.set(shortId, { link: item.link, title: item.title });
          const buttonText = `[${item.size}] S:${item.seeders || '0'} P:${item.peers || '0'} - ${item.title}`;
          return [{ text: buttonText, callback_data: shortId }];
        });

        // *** ADD "Search Again" and "Main Menu" buttons to the results list ***
        buttons.push([{ text: '🔄 Search Again', callback_data: 'action_search' }]);
        buttons.push([{ text: '🏠 Main Menu', callback_data: 'action_main_menu' }]);


        await bot.sendMessage(chatId, '✨ Here are the top results. Select one to see more details, or search again:', {
          reply_markup: { inline_keyboard: buttons }
        });
      } catch (error) {
        console.error(`Telegram: Error processing search for "${query}"${selectedIndexer && selectedIndexer !== 'all' ? ` on "${selectedIndexer}"` : ''}:`, error);
        await bot.sendMessage(chatId, '❌ Sorry, an error occurred while searching. Please try again later.');
        sendMainMenu(chatId, "What would you like to do next?");
      }
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
      // Instead of directly asking for query, first ask for indexer
      userState.set(userId, { state: 'awaiting_indexer_selection' });
      sendIndexerSelectionMenu(chatId);
      return;
    }

    if (callbackData === 'action_main_menu') {
        await bot.answerCallbackQuery(qry.id);
        try {
            // Edit the current message to remove buttons and then send main menu, or just send main menu.
            // For simplicity, just send main menu. If the current message has an inline keyboard,
            // sending a new message without one effectively "clears" it for the user.
            // await bot.editMessageReplyMarkup(null, { chat_id: chatId, message_id: messageId }); // Remove keyboard
        } catch (e) { console.error("Error trying to remove old keyboard:", e.message); }
        sendMainMenu(chatId);
        return;
    }


    if (callbackData === 'action_status') {
      // ... (action_status logic remains the same)
      await bot.answerCallbackQuery(qry.id);
      try {
        await bot.editMessageText("⏳ Fetching download statuses...", { chat_id: chatId, message_id: messageId, reply_markup: null });
      } catch (e) { console.error("Error editing message for status fetch:", e.message); }
      
      try {
        const statuses = await qbittorrentService.getTorrentsInfo();
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
              reply_markup: { inline_keyboard: [ [{ text: `🗑️ Delete (with files)`, callback_data: `del_torrent_${s.hash}` }] ] }
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

    // --- Indexer Selection Handling ---
    if (callbackData.startsWith('select_indexer_')) {
      await bot.answerCallbackQuery(qry.id);
      const selectedIndexer = callbackData.substring('select_indexer_'.length);
      
      // Update user state with the selected indexer
      userState.set(userId, { state: 'awaiting_search_query', selectedIndexer: selectedIndexer });
      
      // Prompt for the search query
      await bot.editMessageText(`🌐 Indexer set to: *${selectedIndexer === 'all' ? 'All Indexers' : selectedIndexer}*.\n\n✍️ Now, please type your search query:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
      return;
    }

    // Handle cancel for indexer selection
    if (callbackData === 'action_cancel_indexer_selection') {
        await bot.answerCallbackQuery(qry.id);
        userState.delete(userId); // Clear state
        sendMainMenu(chatId, "Indexer selection cancelled. What would you like to do?");
        return;
    }

    // --- Torrent Deletion Flow ---
    if (callbackData.startsWith('del_torrent_')) { 
      // ... (del_torrent_ logic remains the same)
      const hash = callbackData.substring('del_torrent_'.length);
      const torrentName = qry.message.text.split('\n')[0].replace('🎬 *', '').replace('*','').trim() || `Torrent (hash: ${hash.substring(0,8)}...)`;
      await bot.answerCallbackQuery(qry.id);
      try {
        await bot.editMessageText(
          `Are you sure you want to delete:\n*${torrentName}*\nand all its downloaded files? This cannot be undone.`,
          { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [ [{ text: '✅ Yes, Delete Files!', callback_data: `del_confirm_yes_${hash}` }], [{ text: '❌ No, Keep It', callback_data: `del_confirm_no_${hash}` }] ] }
          }
        );
      } catch (e) { console.error("Error editing message for delete confirmation:", e.message); }
      return;
    }

    if (callbackData.startsWith('del_confirm_yes_') || callbackData.startsWith('del_confirm_no_')) { 
      // ... (del_confirm_yes_ / del_confirm_no_ logic remains the same)
      const decision = callbackData.startsWith('del_confirm_yes_');
      const hash = callbackData.substring(callbackData.lastIndexOf('_') + 1);
      await bot.answerCallbackQuery(qry.id);
      if (decision) {
        try {
          await bot.editMessageText(`⏳ Deleting torrent (hash: ${hash.substring(0,8)}...) and its files...`, { chat_id: chatId, message_id: messageId, reply_markup: null, parse_mode: 'Markdown' });
          await qbittorrentService.deleteTorrent(hash, true);
          await bot.editMessageText(`✅ Torrent (hash: ${hash.substring(0,8)}...) and its files have been successfully deleted.`, { chat_id: chatId, message_id: messageId, reply_markup: null, parse_mode: 'Markdown' });
        } catch (error) {
          console.error(`Telegram: Error deleting torrent ${hash}:`, error);
          await bot.editMessageText(`❌ Failed to delete torrent (hash: ${hash.substring(0,8)}...). Error: ${error.message}`, { chat_id: chatId, message_id: messageId, reply_markup: null, parse_mode: 'Markdown' });
        }
      } else { 
        await bot.editMessageText('👍 Deletion cancelled. The torrent was not removed.', { chat_id: chatId, message_id: messageId, reply_markup: null });
      }
      sendMainMenu(chatId, "What would you like to do next?");
      return;
    }

    // --- Search Result Download Flow ---
    if (callbackData.startsWith('dl_item_')) { 
      // ... (dl_item_ logic remains the same)
      await bot.answerCallbackQuery(qry.id);
      const info = linkMap.get(callbackData);
      if (info) {
        try {
          await bot.editMessageText(
            `🎬 You selected:\n*${info.title}*\n\nDo you want to start the download?`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [ [{ text: '✅ Yes, Download!', callback_data: `dl_confirm_yes_${callbackData}` }], [{ text: '❌ No, Cancel', callback_data: `dl_confirm_no_${callbackData}` }] ] }
            }
          );
        } catch (e) { console.error("Error editing message for download item confirmation:", e.message); }
      } else {
        try { await bot.editMessageText('⚠️ Invalid selection or it has expired. Please try searching again.', { chat_id: chatId, message_id: messageId, reply_markup: null });
        } catch (e) { console.error("Error editing message for invalid dl_item selection:", e.message); }
        sendMainMenu(chatId, "What would you like to do next?");
      }
      return;
    }

    if (callbackData.startsWith('dl_confirm_yes_') || callbackData.startsWith('dl_confirm_no_')) { 
      // ... (dl_confirm_yes_ / dl_confirm_no_ logic remains the same)
      const decision = callbackData.startsWith('dl_confirm_yes_');
      const originalDlCallbackData = callbackData.substring(callbackData.indexOf('dl_item_')); 
      const info = linkMap.get(originalDlCallbackData);
      await bot.answerCallbackQuery(qry.id);
      if (decision) {
        if (info && info.link) {
          try {
            await bot.editMessageText(`⏳ Starting download for:\n*${info.title}*`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: null });
            await qbittorrentService.addTorrent(info.link);
            await bot.sendMessage(chatId, `✅ Download started for *${info.title}*!\nYou can check the status using the main menu.`, { parse_mode: 'Markdown'});
            linkMap.delete(originalDlCallbackData);
            try { await bot.deleteMessage(chatId, messageId); } catch(e) { /* ignore */ }
          } catch (error) {
            console.error(`Telegram: Error starting download for "${info.title}":`, error);
            await bot.sendMessage(chatId, `❌ Failed to start download for *${info.title}*. Error: ${error.message}`, { parse_mode: 'Markdown'});
            try { await bot.deleteMessage(chatId, messageId); } catch(e) { /* ignore */ }
          }
        } else { 
          try { await bot.editMessageText('⚠️ Invalid selection or link expired. Please try searching again.', { chat_id: chatId, message_id: messageId, reply_markup: null });
          } catch (e) { console.error("Error editing message for invalid dl_confirm selection:", e.message); }
        }
      } else { 
        try { await bot.editMessageText('👍 Download cancelled. What would you like to do next?', { chat_id: chatId, message_id: messageId, reply_markup: null });
        } catch (e) { console.error("Error editing message for dl_confirm_no:", e.message); }
        linkMap.delete(originalDlCallbackData);
      }
      sendMainMenu(chatId, "What would you like to do next?");
      return;
    }

    // Fallback for unhandled callback data
    console.warn(`Telegram: Unhandled callback_data: ${callbackData} from user ${userId} on message ${messageId}`);
    await bot.answerCallbackQuery(qry.id, { text: "🤔 Action unclear or expired."});
  });

  bot.on('polling_error', (error) => {
    console.error('Telegram Polling Error:', error.code, error.message);
  });
  
  console.log("Telegram bot event handlers fully registered.");
  return bot;
}
