require('dotenv').config();
const { default: axios } = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58'); // Base58 encoding/decoding

const allowedUsers= [1778595492];
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const connection = new Connection(process.env.HELIUS_RPC_URL);
// Decode Base58 key and create Keypair
const privateKeyBase58 = process.env.PRIVATE_KEY_BASE58;
const wallet = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

// Trade on Solana with myBuyBot
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(msg.chat.id, "🚫 Access denied. You are not authorized to use this bot.");
    }

    bot.sendMessage(chatId, "Welcome to the Solana Trading Bot!\n");
});
// Check SOL balance of current wallet
bot.onText(/\/balance/, async (msg) => {
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(msg.chat.id, "🚫 Access denied. You are not authorized to use this bot.");
    }
    try {
        const balance = await connection.getBalance(wallet.publicKey);
        bot.sendMessage(msg.chat.id, `Your balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    } catch (err) {
        bot.sendMessage(msg.chat.id, "Error fetching balance.");
    }
});
// Buy a token
bot.onText(/\/buy/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "Buy coming soon!\n");
})
// Sell a token
bot.onText(/\/sell/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "sell coming soon!\n");
})
// View detailed information about your tokens
bot.onText(/\/positions/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "positions coming soon!\n");
})
// Configure your settings
bot.onText(/\/settings/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "settings coming soon!\n");
})
// Snipe [CA]
bot.onText(/\/snipe/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "snipe coming soon!\n");
})
// Burn unwanted tokens to claim SOL
bot.onText(/\/burn/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "burn coming soon!\n");
})
// Withdraw tokens or SOL
bot.onText(/\/withdraw/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "withdraw coming soon!\n");
})
// FAQ and Telegram channel
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "help coming soon!\n");
})
// Backup bots in case of lag or issues
bot.onText(/\/backup/, async (msg) => {
    const chatId = msg.chat.id;
    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }
    bot.sendMessage(chatId, "backup coming soon!\n");
})

console.log("Telegram bot is running...");