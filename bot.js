require('dotenv').config();
const { default: axios } = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58'); // Base58 encoding/decoding
const { checkWallet } = require("./src/checkWallet.js"); 
const fs = require('fs');

const allowedUsers= [1778595492];
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const connection = new Connection(process.env.HELIUS_RPC_URL);

// Load existing wallets or create an empty object
const WALLET_FILE = "wallets.json";
let wallets = {};
if (fs.existsSync(WALLET_FILE)) {
    wallets = JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
}

// Function to save wallets to file
function saveWallets() {
    fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2));
}

// Function to get or create a wallet for a user
function getUserWallet(chatId) {
    if (!wallets[chatId]) {
        console.log(`Creating a new wallet for user: ${chatId}`);

        const newWallet = Keypair.generate();
        wallets[chatId] = [{
            label: "W1",
            privateKeyBase58: bs58.encode(newWallet.secretKey),
            publicKey: newWallet.publicKey.toBase58()
        }];

        saveWallets();
    }

    // Return the first wallet (default active wallet)
    return wallets[chatId].privateKeyBase58;
}

// Function to get the active wallet Keypair
function getWalletKeypair(wallet) {
    return Keypair.fromSecretKey(bs58.decode(wallet.privateKeyBase58));
}

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id; // Get message ID to edit
    const data = query.data;

    if (data === "buy") {
        bot.sendMessage(chatId, "💰 Enter the amount you want to buy:");
    } else if (data === "sell") {
        bot.sendMessage(chatId, "📉 Enter the amount you want to sell:");
    } else if (data === "positions") {
        bot.sendMessage(chatId, "🔎 Fetching your open positions...");
    } else if (data === "limit_orders") {
        bot.sendMessage(chatId, "📈 Viewing Limit Orders...");
    } else if (data === "dca_orders") {
        bot.sendMessage(chatId, "📉 Viewing DCA Orders...");
    } else if (data === "copy_trade") {
        bot.sendMessage(chatId, "📎 Copy trading feature is coming soon...");
    } else if (data === "sniper") {
        bot.sendMessage(chatId, "🎯 Sniper mode enabled...");
    } else if (data === "trenches") {
        bot.sendMessage(chatId, "⚔️ Entering the trenches...");
    } else if (data === "referrals") {
        bot.sendMessage(chatId, "👥 Viewing referral program...");
    } else if (data === "watchlist") {
        bot.sendMessage(chatId, "⭐ Viewing your watchlist...");
    } else if (data === "withdraw") {
        bot.sendMessage(chatId, "💸 Withdraw funds...");
    } else if (data === "settings") {
        const settingsMenu = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⬅️ Back", callback_data: "main_menu" }, { text: "🇬🇧 English", callback_data: "language" }],
                    //[{ text: "✅ Fast 🏇", callback_data: "fast_fee" }, { text: "🚀 Turbo", callback_data: "turbo_fee" }, { text: "⚙️ Custom Fee", callback_data: "custom_fee" }],
                    //[{ text: "Buy Settings", callback_data: "buy_settings" }, { text: "Sell Settings", callback_data: "sell_settings" }],
                    //[{ text: "🔴 MEV Protect (Buys)", callback_data: "mev_protect_buys" }, { text: "🔴 MEV Protect (Sells)", callback_data: "mev_protect_sells" }],
                    //[{ text: "🔴 Auto Buy", callback_data: "auto_buy" }, { text: "🔴 Auto Sell", callback_data: "auto_sell" }],
                    //[{ text: "🔴 Confirm Trades", callback_data: "confirm_trades" }],
                    //[{ text: "📊 PnL Cards", callback_data: "pnl_cards" }, { text: "📈 Chart Previews", callback_data: "chart_previews" }],
                    [{ text: "👁 Show/Hide Tokens", callback_data: "toggle_tokens" }, { text: "👛 Wallets", callback_data: "wallets" }],
                    //[{ text: "🔒 Account Security", callback_data: "account_security" }, { text: "🟢 Sell Protection", callback_data: "sell_protection" }],
                    //[{ text: "⚡ BOLT", callback_data: "bolt" }],
                    //[{ text: "Simple Mode ➡️", callback_data: "simple_mode" }]
                ]
            }
        };

        bot.editMessageText("⚙️ *Settings Menu:* Choose an option:", {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            ...settingsMenu
        });
    } else if (data === "wallets"){
        try {
            let solanaText = "*Solana Wallets*\n";
            let walletsMenu;
            let solanaWalletButtons = [];

            if ( wallets[chatId].length === 0) {
                solanaText += "🚨 *No wallet found.*\nCreate one using the button below.\n\n";
                walletsMenu = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "➕ Create Solana Wallet", callback_data: "create_wallet" }, { text: "📥 Import Solana Wallet", callback_data: "import_wallet" }],
                            [{ text: "⬅️ Back to Main", callback_data: "main_menu" }]
                        ]
                    }
                };
            } else {
                const balance = await checkWallet(Keypair.fromSecretKey(bs58.decode(wallets[chatId].privateKeyBase58)).publicKey, connection);
                solanaText += `\`${wallets[chatId].publicKey}\`\n*Label:* W1 ✅\n*Balance:* ${balance.toFixed(4)} SOL\n\n`;
            }
            walletsMenu = {
                reply_markup: {
                    inline_keyboard: [
                        ...solanaWalletButtons, // Inserts only existing wallet buttons
                        [{ text: "➕ Create Solana Wallet", callback_data: "create_wallet" }],// { text: "📥 Import Solana Wallet", callback_data: "import_wallet" }],
                        [{ text: "⬅️ Back to Main", callback_data: "main_menu" }]
                    ]
                }
            };

            bot.editMessageText(`${solanaText}💡 To rename or export your Solana wallets, click the button with the wallet's name.`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                ...walletsMenu
            });

        } catch (error) {
            bot.sendMessage(chatId, "❌ Error fetching wallets.");
            console.log("❌ Error fetching wallets." + error.message);
        }
    } else if(data === "create_wallet"){
        if (wallets[chatId]) {
            return bot.sendMessage(chatId, "🚨 You already have a wallet created.");
        }

        const newWallet = Keypair.generate();
        const privateKeyBase58 = bs58.encode(newWallet.secretKey);
        const publicKey = newWallet.publicKey.toBase58();

        wallets[chatId] = { privateKeyBase58, publicKey };
        saveWallets();

        bot.sendMessage(chatId, `✅ Wallet Created!\n\n🗝 *Public Key:* \`${publicKey}\`\n🔒 *Private Key:* [Stored Securely]`, { parse_mode: "Markdown" });
    } else if (data === "help") {
        bot.sendMessage(chatId, "❓ How can I help you?");
    } else if (data === "refresh") {
        bot.sendMessage(chatId, "🔄 Refreshing your balance...");
    } else if (data === "main_menu") {

        if (!allowedUsers.includes(chatId)) {
            return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
        }
    
        try {
            // Retrieve the user's wallet (or create a new one if first-time user)
            const userWallet = getUserWallet(chatId);
            const publicKey = Keypair.fromSecretKey(bs58.decode(userWallet)).publicKey;
    
            // Fetch balance
            const balance = await checkWallet(publicKey, connection);
    
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🟢 Buy", callback_data: "buy" }, { text: "🔴 Sell", callback_data: "sell" }],
                        //[{ text: "📊 Positions", callback_data: "positions" }, { text: "📈 Limit Orders", callback_data: "limit_orders" }, { text: "📉 DCA Orders", callback_data: "dca_orders" }],
                        //[{ text: "📎 Copy Trade", callback_data: "copy_trade" }, { text: "🎯 Sniper", callback_data: "sniper" }],
                        //[{ text: "⚔️ Trenches", callback_data: "trenches" }, { text: "👥 Referrals", callback_data: "referrals" }, { text: "⭐ Watchlist", callback_data: "watchlist" }],
                        [{ text: "💸 Withdraw", callback_data: "withdraw" }, { text: "👛 Wallets", callback_data: "wallets" }],
                        [{ text: "❓ Help", callback_data: "help" }, { text: "🔄 Refresh", callback_data: "refresh" }]
                    ]
                }
            };
    
        bot.sendMessage(chatId, `💰 *Solana*  
\`${publicKey}\` *(Tap to copy)*  
📈 *Balance:* ${balance.toFixed(4)} SOL ($0,000.00)  

Click on the Refresh button to update your current balance.  

📢 Join our Telegram group [@myBuySolBot](https://t.me/myBuySolBot) and follow us on [Twitter](https://twitter.com/)!`, 
    { parse_mode: "Markdown", ...options }
    );

    } catch (error) {
        bot.sendMessage(chatId, "❌ Error /start.");
    }
}

    bot.answerCallbackQuery(query.id);
});


// Trade on Solana with myBuyBot
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    if (!allowedUsers.includes(msg.from.id)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }

    try {
        // Retrieve the user's wallet (or create a new one if first-time user)
        const userWallet = getUserWallet(chatId);
        const publicKey = Keypair.fromSecretKey(bs58.decode(userWallet)).publicKey;

        // Fetch balance
        const balance = await checkWallet(publicKey, connection);

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🟢 Buy", callback_data: "buy" }, { text: "🔴 Sell", callback_data: "sell" }],
                    //[{ text: "📊 Positions", callback_data: "positions" }, { text: "📈 Limit Orders", callback_data: "limit_orders" }, { text: "📉 DCA Orders", callback_data: "dca_orders" }],
                    //[{ text: "📎 Copy Trade", callback_data: "copy_trade" }, { text: "🎯 Sniper", callback_data: "sniper" }],
                    //[{ text: "⚔️ Trenches", callback_data: "trenches" }, { text: "👥 Referrals", callback_data: "referrals" }, { text: "⭐ Watchlist", callback_data: "watchlist" }],
                    [{ text: "💸 Withdraw", callback_data: "withdraw" }, { text: "👛 Wallets", callback_data: "wallets" }],
                    [{ text: "❓ Help", callback_data: "help" }, { text: "🔄 Refresh", callback_data: "refresh" }]
                ]
            }
        };

        bot.sendMessage(chatId, `💰 *Solana*  
\`${publicKey}\` *(Tap to copy)*  
📈 *Balance:* ${balance.toFixed(4)} SOL ($0,000.00)  

Click on the Refresh button to update your current balance.  

📢 Join our Telegram group [@myBuySolBot](https://t.me/myBuySolBot) and follow us on [Twitter](https://twitter.com/)!`, 
    { parse_mode: "Markdown", ...options }
    );

    } catch (error) {
        bot.sendMessage(chatId, "❌ Error /start.");
    }
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