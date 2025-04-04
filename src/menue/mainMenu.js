const { getUserTokens } = require("../helperFunctions.js")
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
const { saveWallets, loadWallets } = require("../wallets/allWallets.js")

const showMainMenu = async (bot, chatId, connection) => {
    try {
        const wallets = loadWallets();

        // Ensure wallets exist for the user
        if (!wallets[chatId] || wallets[chatId].wallets.length === 0) {
            const newWallet = Keypair.generate();
            wallets[chatId] = {
                activeWallet: 0,
                wallets: [{
                    label: "W1",
                    privateKeyBase58: bs58.encode(newWallet.secretKey),
                    publicKey: newWallet.publicKey,
                    solBalanceLamports: 0
                }]
            };
            saveWallets(wallets);
        }

        // Get the active wallet
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = userWallet.publicKey;

        // Fetch balance (ensure up-to-date if needed)
        const balanceLamports = userWallet.solBalanceLamports || 0;
        const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🟢 Buy", callback_data: "buy" }, { text: "🔴 Sell", callback_data: "sell" }],
                    [{ text: "📊 Positions", callback_data: "positions" }],
                    [{ text: "👛 Wallets", callback_data: "wallets" }, { text: "💸 Withdraw", callback_data: "withdraw" }],
                ]
            }
        };

        let message = `🚀 *Welcome to MyBuySolBot!*  \n\n`;

        message += `💰 *Solana Wallet Overview*\n`;
        message += `📜 *Public Key:*  \n\`${publicKey}\` *(Tap to copy)*  \n`;
        message += `📈 *Balance:* \`${balanceSol.toFixed(4)} SOL\`  \n\n`;

        message += `✨ *Features:*  \n`;
        message += `    ✅ *Buy Tokens (0% Fees!)*  \n`;
        message += `    ✅ *Sell Tokens (Only 0.2% Fee!)*  \n`;
        message += `    ✅ *Create up to 10 Wallets*  \n`;
        message += `    ✅ *Withdraw Custom SOL Amount*  \n`;
        message += `    ✅ *Withdraw SOL by Percentage*  \n`;
        message += `    ✅ *Withdraw*  \n`;
        message += `    ✅ *Show Private Key*  \n\n`;

        message += `⚖️ *Trading Fees:*  \n`;
        message += `    ✅ *0% Fee* on Buys  \n`;
        message += `    💸 *0.2% Fee* on Sells  \n\n`;

        message += `🛠 *Upcoming Features:*  \n`;
        message += `    🔹 *Limit Orders*  \n`;
        message += `    🔹 *Positions Tracking*  \n`;
        message += `    🔹 *Buy & Sell PnL Calculation*  \n\n`;

        message += `📢 *Stay Connected!*  \n`;
        message += `👥 [Join our Telegram](https://t.me/myBuySolBot)  \n`;
        message += `👥 [Follow us on Twitter](https://x.com/myBuyBot)  \n`;
        message += `🔔 *More features coming soon!*`;

        await bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...options });

    } catch (error) {
        console.error("❌ Error showing main menu:", error.message);
        bot.sendMessage(chatId, "❌ Error showing main menu.");
    }
};

module.exports = { showMainMenu }