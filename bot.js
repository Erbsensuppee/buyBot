require('dotenv').config();
const axios = require("axios");
const TelegramBot = require('node-telegram-bot-api');
const { 
    Connection, 
    PublicKey, 
    Keypair, 
    LAMPORTS_PER_SOL, 
    VersionedTransaction, 
    Transaction,
    sendAndConfirmTransaction,
    SystemProgram } = require('@solana/web3.js');
const bs58 = require('bs58'); // Base58 encoding/decoding
const { checkWallet } = require("./src/checkWallet.js"); 
const {getQuote, getSwapInstructions, getSwapResponse} = require("./src/jupiterApi.js")
const fs = require('fs');
const { getAccount } = require("@solana/spl-token");
const { getAddressLookupTableAccounts, simulateTransaction, getAveragePriorityFee, createVersionedTransaction, deserializeInstruction } = require("./src/utils.js")
const { createJitoBundle, sendJitoBundle, bundleSignature, checkBundleStatus } = require("./src/jitoService.js")
const { 
    formatNumber, 
    calculateMarketCap,
    calculateTokens,
    calculateSolana,
    getUserTokens,
    getTokenBalanceFromTransaction,
    updateTokenData,
    storeTokenData,
    getSellTransactionDetails,
    getBuyTransactionDetails
 } = require("./src/helperFunctions.js");
const { performSwapBuy, performSwapSell } = require('./src/swap.js');
const { showPositionMenu } = require("./src/menue/positons.js")
const { refreshAllBalances, saveWallets, loadWallets, refreshAllBalancesGlobal, decreaseSolBalanceForWallet, increaseSolBalanceForWallet } = require("./src/wallets/allWallets");
const { showWalletsMenu } = require("./src/wallets/showWalletsMenu");



// const allowedUsers = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',').map(Number) : [];
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const connection = new Connection(process.env.HELIUS_RPC_URL);
// Store user-specific buy data (custom SOL amount, slippage, token mint, etc.)
const userBuyData = {}; 
const userSellData = {};
const userWithdrawData = {};
const userContext = {};  // Store the last action of each user

// Load existing wallets or create an empty object
const WALLET_FILE = "wallets.json";

let wallets = loadWallets();

const feeAccount = "5KMcyGvqwd95wgFiK6Q9rSA5w9sBrDcUE1bP6cNt9Qqj";

// Helper function to validate Solana token addresses
function isValidSolanaAddress(address) {
    try {
        new PublicKey(address);
        return true;
    } catch (error) {
        return false;
    }
}

// Fetch token price from Jupiter API
async function fetchTokenPrice(chatId, tokenMint) {
    try {
        // Ensure tokenMint is a valid Solana address
        if (!isValidSolanaAddress(tokenMint)) {
            return bot.sendMessage(chatId, "❌ Invalid token mint address. Please enter a correct Solana token address.");
        }
        // Ensure userBuyData[chatId] exists before accessing solAmount
        if (!userBuyData[chatId]) {
            userBuyData[chatId] = {};  // Initialize it to an empty object if undefined
        }

        // Fetch token price from Jupiter API
        const response = await axios.get(`https://api.jup.ag/price/v2?ids=${tokenMint},${process.env.SOLANA_ADDRESS}`);

        if (!response.data || !response.data.data[tokenMint]) {
            return bot.sendMessage(chatId, "❌ Token not found on Jupiter. Please try a different token.");
        }

        // Fetch token informations from Jupiter API
        const response2 = await axios.get(`https://api.jup.ag/tokens/v1/token/${tokenMint}`);

        if (!response2.data || !response2.data.address === tokenMint) {
            return bot.sendMessage(chatId, "❌ Token not found on Jupiter. Please try a different token.");
        }

        // Extract token details
        const tokenData = response.data.data[tokenMint];
        userBuyData[chatId].tokenData = tokenData
        const solanaData = response.data.data[process.env.SOLANA_ADDRESS];
        userBuyData[chatId].solanaData = solanaData
        const tokenInformations = response2.data;
        userBuyData[chatId].tokenInformations = tokenInformations
        const price = tokenData.price || 0;

        // Fetch the user's active wallet balance
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = userWallet.publicKey;

        let solAmount = userBuyData[chatId].solAmount || 0.01;
        let slippage = userBuyData[chatId].slippage || 5;
        const balance = await checkWallet(publicKey, connection);
        userBuyData[chatId].userBalance = balance;

        // Show swap details
        let tokenSymbol = tokenInformations.symbol;
        let tokenMarcetCap = calculateMarketCap(tokenInformations.decimals, tokenData.price);
        let tokenValue = solAmount * solanaData.price;
        let calculatedTokenAmount = calculateTokens(solanaData.price, tokenData.price, solAmount);
        let message = "";
        message += `*Buy $${tokenSymbol.toUpperCase()}* — (${tokenSymbol})\n\`${tokenMint}\`\n\n`;

        message += `Balance: *${balance.toFixed(3)} SOL — W${activeIndex + 1}*\n`
        message += `Price: *$${formatNumber(price)}* — MC: *$${tokenMarcetCap.toFixed(2)}K*\n\n`;

        message += `*${solAmount} SOL* ⇄ *${calculatedTokenAmount.toFixed(0)} ${tokenSymbol.toUpperCase()} ($${tokenValue.toFixed(2)})*\n`;

        // Store the custom amount for this user
        if (!userBuyData[chatId]) userBuyData[chatId] = {};
        userBuyData[chatId].tokenMint = tokenMint;
        userBuyData[chatId].tokenSymbol = tokenInformations.symbol;
        userBuyData[chatId].solAmount = solAmount; // Default to 0.5 SOL
        userBuyData[chatId].slippage = slippage; // Default to 0.5%

        // message += `📉 *Bonding Curve Progression:* 0.15%\n`;
        // message += `⚖️ *1 SOL → ${solToTokenRate.toFixed(2)} ${tokenData.mint}* ($${(1 * price).toFixed(2)})\n`;
        // message += `📉 *Price Impact:* ${priceImpact.toFix

        // Rebuild the buy menu with updated values
        const buyMenu = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `✅ W${activeIndex + 1}`, callback_data: "active_wallet" }],
                    [{ text: "✏️ Custom SOL", callback_data: "custom_sol" }, { text: `✅ ${solAmount} SOL`, callback_data: "set_sol" }],
                    [{ text: "✏️ Custom Slippage", callback_data: "custom_slippage" }, { text: `✅ ${slippage}%`, callback_data: "set_slippage" }],
                    [{ text: "✅ BUY", callback_data: `confirm_buy_${tokenMint}` }],
                    [{ text: "⬅️ Back", callback_data: "wallets" }, { text: "🔄 Refresh", callback_data: `fetchTokenPrice_${tokenMint}` }]
                ]
            }
        };

        bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...buyMenu });

    } catch (error) {
        console.error("❌ Error fetching token price:", error);
        bot.sendMessage(chatId, "❌ Failed to fetch token price. Please try again later.");
    }
}

async function fetchSellPrice(chatId, tokenMint) {
    try {
        // Ensure tokenMint is a valid Solana address
        if (!isValidSolanaAddress(tokenMint)) {
            return bot.sendMessage(chatId, "❌ Invalid token mint address. Please enter a correct Solana token address.");
        }
        // Store the token info for this user
        if (!userSellData[chatId]) userSellData[chatId] = {};

        // Fetch token price from Jupiter API (Reverse: token → SOL)
        const response = await axios.get(`https://api.jup.ag/price/v2?ids=${tokenMint},${process.env.SOLANA_ADDRESS}`);

        if (!response.data || !response.data.data[tokenMint]) {
            return bot.sendMessage(chatId, "❌ Token not found on Jupiter. Please try a different token.");
        }

        // Fetch token details from Jupiter API
        const response2 = await axios.get(`https://api.jup.ag/tokens/v1/token/${tokenMint}`);

        if (!response2.data || response2.data.address !== tokenMint) {
            return bot.sendMessage(chatId, "❌ Token not found on Jupiter. Please try a different token.");
        }

        // Extract token details
        const tokenData = response.data.data[tokenMint];
        userSellData[chatId].tokenData = tokenData;
        const solanaData = response.data.data[process.env.SOLANA_ADDRESS];
        userSellData[chatId].solanaData = solanaData;
        const tokenInformations = response2.data;
        userSellData[chatId].tokenInformations = tokenInformations
        const price = tokenData.price || 0;

        // Fetch the user's active wallet balance
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = userWallet.publicKey;

        // Fetch user's token balance
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(publicKey),
            { mint: new PublicKey(tokenMint) }
        );

        if (!tokenAccounts.value.length) {
            return bot.sendMessage(chatId, "❌ No balance available for this token.");
        }
        const tokenAccount = tokenAccounts.value[0].pubkey;
        const accountInfo = await getAccount(connection, tokenAccount);
        userSellData[chatId].accountInfo = accountInfo;
        const tmpSellAmount = Number(accountInfo.amount);

        const tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        const slippage = userSellData[chatId]?.slippage || 5;
        const selectedPercentage = userSellData[chatId]?.selectedPercentage || 100; // Default: No selection

        // Calculate estimated SOL received for different percentages
        const percentages = [0, 25, 50, 75, 100];
        const estimatedAmounts = percentages.map(pct => ({
            pct,
            amount: (tmpSellAmount * pct) / 100,
            humanAmount: (tokenBalance * pct) /100,
            estimatedSol: ((tokenBalance * pct) / 100) * price,
            isSelected: pct === selectedPercentage // Check if this is the selected one
        }));

        // Find the selected percentage's amount
        const selectedAmount = estimatedAmounts.find(item => item.pct === selectedPercentage)?.amount || 0;
        const selectedHumanAmount = estimatedAmounts.find(item => item.pct === selectedPercentage)?.humanAmount || 0;


        userSellData[chatId].tokenMint = tokenMint;
        userSellData[chatId].tokenSymbol = tokenInformations.symbol;
        userSellData[chatId].tokenBalance = tokenBalance;
        userSellData[chatId].slippage = slippage;
        userSellData[chatId].sellTokenAmount = selectedAmount;
        let tokenSymbol = tokenInformations.symbol;
        let tokenValue = tokenData.price * tokenBalance;
        let selectedValue = tokenData.price * selectedHumanAmount;
        let tokenMarcetCap = calculateMarketCap(tokenInformations.decimals, tokenData.price, tokenBalance);
        let solanaAmount = calculateSolana(solanaData.price, tokenData.price, selectedHumanAmount)
        let solanaSellValue = solanaAmount * solanaData.price;
        let message = ``;
        message += `*Sell $${tokenSymbol.toUpperCase()}* — (${tokenSymbol})\n\`${tokenMint}\`\n\n`;

        message += `Balance: *${tokenBalance.toFixed(4)} ${tokenSymbol.toUpperCase()} ($${tokenValue.toFixed(2)}) — W${activeIndex + 1}\n`;
        message += `Price: *$${formatNumber(price)}* — MC: *$${tokenMarcetCap.toFixed(2)}K*\n\n`;

        message += `__You Sell__:\n`
        message += `*${selectedHumanAmount.toFixed(0)} ($${selectedValue.toFixed(2)}) ⇄ *${solanaAmount.toFixed(3)} SOL ($${solanaSellValue.toFixed(2)})*`

        // Build sell menu with percentage options
        const sellMenu = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `✅ W${activeIndex + 1}`, callback_data: "active_wallet" }],
                    [
                        { text: `${selectedPercentage === 25 ? "✅" : "🔹"} 25%`, callback_data: `pct_sell__25_${tokenMint}` },
                        { text: `${selectedPercentage === 50 ? "✅" : "🔹"} 50%`, callback_data: `pct_sell__50_${tokenMint}` }
                    ],
                    [
                        { text: `${selectedPercentage === 75 ? "✅" : "🔹"} 75%`, callback_data: `pct_sell__75_${tokenMint}` },
                        { text: `${selectedPercentage === 100 ? "✅" : "🔹"} 100%`, callback_data: `pct_sell__100_${tokenMint}` }
                    ],
                    [{ text: "✏️ Custom Slippage", callback_data: "custom_sell_slippage" }, { text: `✅ ${slippage}%`, callback_data: "set_sell_slippage" }],
                    [{ text: "✅ SELL", callback_data: `confirm_sell_${tokenMint}` }],
                    [{ text: "⬅️ Back", callback_data: "wallets" }, { text: "🔄 Refresh", callback_data: `fetchSellPrice_${tokenMint}` }]
                ]
            }
        };

        bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...sellMenu });

    } catch (error) {
        console.error("❌ Error fetching token price:", error);
        bot.sendMessage(chatId, "❌ Failed to fetch token price. Please try again later.");
    }
}

async function refreshBuyWindow(chatId, messageId) {
    if (!userBuyData[chatId] || !userBuyData[chatId].tokenMint) {
        return bot.sendMessage(chatId, "❌ No token selected. Please enter a token mint first.");
    }

    // Ensure userBuyData[chatId] exists before accessing solAmount
    if (!userBuyData[chatId]) {
        userBuyData[chatId] = {};  // Initialize it to an empty object if undefined
    }

    const tokenMint = userBuyData[chatId].tokenMint;
    const solAmount = userBuyData[chatId].solAmount || 0.5; // Default to 0.5 SOL
    const slippage = userBuyData[chatId].slippage || 5; // Default to 0.5%

    const tokenInformations = userBuyData[chatId].tokenInformations;
    const activeIndex = wallets[chatId].activeWallet || 0;
    const tokenData = userBuyData[chatId].tokenData;
    const solanaData = userBuyData[chatId].solanaData;
    const price = tokenData.price || 0;
    const balance = userBuyData[chatId].userBalance;

    let tokenSymbol = tokenInformations.symbol;
    let tokenMarcetCap = calculateMarketCap(tokenInformations.decimals, tokenData.price);
    let tokenValue = solAmount * solanaData.price;
    let calculatedTokenAmount = calculateTokens(solanaData.price, tokenData.price, solAmount);
    let message = "";
    // Show swap details
    message += `*Buy $${tokenSymbol.toUpperCase()}* — (${tokenSymbol})\n\`${tokenMint}\`\n\n`;

    message += `Balance: *${balance.toFixed(3)} SOL — W${activeIndex + 1}*\n`
    message += `Price: *$${formatNumber(price)}* — MC: *$${tokenMarcetCap.toFixed(2)}K*\n\n`;

    message += `*${solAmount} SOL* ⇄ *${calculatedTokenAmount.toFixed(0)} ${tokenSymbol.toUpperCase()} ($${tokenValue.toFixed(2)})*\n`;


    // Rebuild the buy menu with updated values
    const buyMenu = {
        reply_markup: {
            inline_keyboard: [
                [{ text: `✅ W${activeIndex + 1}`, callback_data: "active_wallet" }],
                [{ text: "✏️ Custom SOL", callback_data: "custom_sol" }, { text: `✅ ${solAmount} SOL`, callback_data: "set_sol" }],
                [{ text: "✏️ Custom Slippage", callback_data: "custom_slippage" }, { text: `✅ ${slippage}%`, callback_data: "set_slippage" }],
                [{ text: "✅ BUY", callback_data: `confirm_buy_${tokenMint}` }],
                [{ text: "⬅️ Back", callback_data: "wallets" }, { text: "🔄 Refresh", callback_data: `fetchTokenPrice_${tokenMint}` }]
            ]
        }
    };

    // Update the existing message instead of sending a new one
    bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        ...buyMenu
    });
}

async function getUserTokensOnChain(chatId, publicKey) {
    try {
        // Fetch all tokens owned by the user
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(publicKey),
            { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
        );

        const tokens = [];

        for (const account of tokenAccounts.value) {
            const mintAddress = account.account.data.parsed.info.mint;
            const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
             // Fetch token informations from Jupiter API
            const response2 = await axios.get(`https://api.jup.ag/tokens/v1/token/${mintAddress}`);

            if (!response2.data || !response2.data.address === mintAddress) {
                return bot.sendMessage(chatId, "❌ Token not found on Jupiter. Please try a different token.");
            }

            if (balance > 0) {
                tokens.push({
                    symbol: response2.data.symbol,
                    mint: mintAddress,
                    balance,
                });
            }
        }

        return tokens;
    } catch (error) {
        console.error("❌ Error fetching user tokens:", error);
        return [];
    }
}

async function showSellMenu(chatId) {
    try {
        // Fetch active wallet
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = userWallet.publicKey;

        // Fetch user's tokens
        const tokens = await getUserTokens(chatId, publicKey);

        if (tokens.length === 0) {
            return bot.sendMessage(chatId, "❌ No tokens available to sell.");
        }

        let message = `🛒 *Select a token to sell* (${tokens.length}/${tokens.length})\n`;
        message += `💰 *Balance:* ${await checkWallet(publicKey, connection)} SOL\n\n`;

        // Create inline buttons for each token
        const buttons = tokens.map(token => [
            { text: `${token.symbol}`, callback_data: `sell_${token.tokenMint}` }
        ]);

        // Add navigation buttons
        buttons.push([{ text: "⬅️ Back", callback_data: "main_menu" }]);

        const sellMenu = {
            reply_markup: {
                inline_keyboard: buttons
            }
        };

        bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...sellMenu });

    } catch (error) {
        console.error("❌ Error showing sell menu:", error);
        bot.sendMessage(chatId, "❌ Failed to fetch sellable tokens.");
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    // Check if the message contains text
    if (typeof msg.text !== 'string') {
        bot.sendMessage(chatId, "I only process text messages.");
        return;
    }
    const text = msg.text.trim();

    // Ignore commands (messages that start with "/")
    if (text.startsWith("/")) {
        return;
    }

    // 🔄 Check if user is setting a withdrawal address
    if (userContext[chatId] === "awaiting_withdrawal_address") {
        if (!isValidSolanaAddress(text)) {
            return bot.sendMessage(chatId, "❌ Invalid Solana address. Please enter a valid withdrawal address.");
        }

        // ✅ Store the withdrawal address
        if (!userWithdrawData[chatId]) userWithdrawData[chatId] = {};
        userWithdrawData[chatId].withdrawalAddress = text;
        delete userContext[chatId];  // Clear context after input
        //refreshWithdrawMenu(chatId, messageId);
        return;
    }

    // 🪙 Check if the input is a valid Solana token mint address (and user is not setting a withdrawal address)
    if (isValidSolanaAddress(text)) {
        console.log(`🪙 User sent a token mint address: ${text}`);
        
        try {
            // Fetch token price and show buy menu
            await fetchTokenPrice(chatId, text);
        } catch (error) {
            console.error("❌ Error fetching token price:", error.message);
        }
    }
});





bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id; // Get message ID to edit
    const data = query.data;

    // Acknowledge the callback immediately to prevent Telegram from resending it
    bot.answerCallbackQuery(query.id, { text: "⏳ Processing...", show_alert: false });

    // if (!allowedUsers.includes(chatId)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }

    if (data === "buy") {
        if (!wallets[chatId] || !wallets[chatId].wallets || wallets[chatId].wallets.length === 0) {
            return bot.sendMessage(chatId, "🚨 You need to create a wallet first.");
        }
    
        const activeIndex = wallets[chatId].activeWallet || 0; // Default to W1

        // Ensure active wallet is valid
        if (activeIndex === undefined || activeIndex < 0 || activeIndex >= wallets[chatId].wallets.length) {
            return bot.sendMessage(chatId, "🚨 You need to select an active wallet first. Go to /wallets and choose one.");
        }

        bot.sendMessage(chatId, "💰 Enter a token symbol or address to buy:");

        // // Step 2: Capture user's response (next message)
        // bot.once("message", async (msg) => {
        //     const tokenInput = msg.text.trim();

        //     // Validate input
        //     if (!isValidSolanaAddress(tokenInput) && tokenInput.length > 10) {
        //         return bot.sendMessage(chatId, "❌ Invalid token address. Please enter a correct Solana token address or symbol.");
        //     }

        //     // Proceed to fetch price
        //     const tokenSymbol = tokenInput;
        //     await fetchTokenPrice(chatId, tokenSymbol);
        // });
    } else if (data === "custom_withdraw_amount") {
        bot.sendMessage(chatId, "💰 Enter the amount of SOL you want to withdraw:").then((sentMessage) => {
            const promptMessageId = sentMessage.message_id; // Store message ID

            bot.once("message", async (msg) => {
                if (typeof msg.text !== 'string') {
                    bot.sendMessage(chatId, "I only process text messages.");
                    return;
                }
                const solAmount = parseFloat(msg.text.trim());
        
                if (isNaN(solAmount) || solAmount <= 0) {
                    return bot.sendMessage(chatId, "❌ Invalid SOL amount. Please enter a positive number.");
                }
        
                // Store the custom withdrawal amount
                if (!userWithdrawData[chatId]) userWithdrawData[chatId] = {};
                userWithdrawData[chatId].solAmount = solAmount * LAMPORTS_PER_SOL;
        
                // ✅ Delete the original prompt message
                bot.deleteMessage(chatId, promptMessageId).catch((err) => {
                    console.error("❌ Error deleting message:", err.message);
                });
                // Refresh the withdraw menu with updated values
                refreshWithdrawMenu(chatId, messageId);
            });

        });

    
        //bot.answerCallbackQuery(query.id);
    } else if (data === "withdraw_50" || data === "withdraw_100") {
        const percentage = data === "withdraw_50" ? 50 : 100;
        
        // Ensure user withdraw data exists
        if (!userWithdrawData[chatId]) userWithdrawData[chatId] = {};
    
        // Fetch the user's active wallet balance
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = new PublicKey(userWallet.publicKey);

        const balance = await connection.getBalance(publicKey);

    
        // Calculate amount based on percentage
        const solAmount = (balance * percentage) / 100;
    
        // Calculate the max transferable SOL (leave a small amount for transaction fees)
        const rentExemptionBuffer = 5000; // Small buffer for transaction fees
        const lamportsToSend = solAmount - rentExemptionBuffer > 0 ? solAmount - rentExemptionBuffer : 0;

        // Store the selected percentage and amount
        userWithdrawData[chatId].selectedPercentage = percentage;
        userWithdrawData[chatId].solAmount = lamportsToSend;
    
        // Refresh the withdraw menu with updated values
        refreshWithdrawMenu(chatId, messageId);
    
        bot.answerCallbackQuery(query.id);
    } else if (data === "set_withdrawal_address") {
        userContext[chatId] = "awaiting_withdrawal_address"; // Set context to expect address input
        bot.sendMessage(chatId, "🏦 Enter your Solana withdrawal address:").then((sentMessage) => {
            const promptMessageId = sentMessage.message_id; // Store message ID
            
            bot.once("message", async (msg) => {
                if (typeof msg.text !== 'string') {
                    bot.sendMessage(chatId, "I only process text messages.");
                    return;
                }
                const address = msg.text.trim();
        
                if (!isValidSolanaAddress(address)) {
                    return bot.sendMessage(chatId, "❌ Invalid address. Please enter a valid Solana address.");
                }
        
                // Store the withdrawal address
                if (!userWithdrawData[chatId]) userWithdrawData[chatId] = {};
                userWithdrawData[chatId].withdrawalAddress = address;
        
                // ✅ Delete the original prompt message
                bot.deleteMessage(chatId, promptMessageId).catch((err) => {
                    console.error("❌ Error deleting message:", err.message);
                });
                // Refresh the withdraw menu with updated values
                refreshWithdrawMenu(chatId, messageId);
            });
        });
    } else if (data === "confirm_withdraw") {
        if (!userWithdrawData[chatId]) {
            return bot.sendMessage(chatId, "❌ No withdrawal data found. Please try again.");
        }
    
        const solAmount = userWithdrawData[chatId].solAmount;
        const withdrawalAddress = userWithdrawData[chatId].withdrawalAddress;
    
        if (!solAmount || solAmount <= 0) {
            return bot.sendMessage(chatId, "❌ Invalid withdrawal amount.");
        }
    
        if (!isValidSolanaAddress(withdrawalAddress)) {
            return bot.sendMessage(chatId, "❌ Invalid withdrawal address.");
        }
    
        bot.sendMessage(chatId, `🔄 Processing withdrawal of *${solAmount/LAMPORTS_PER_SOL} SOL* to:\n\`${withdrawalAddress}\``, { parse_mode: "Markdown" });
    
        try {
            const activeIndex = wallets[chatId].activeWallet || 0;
            const userWallet = wallets[chatId].wallets[activeIndex];
            const senderKeypair = Keypair.fromSecretKey(bs58.decode(userWallet.privateKeyBase58));
    
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: senderKeypair.publicKey,
                    toPubkey: new PublicKey(withdrawalAddress),
                    lamports: solAmount
                })
            );
    
            const txSignature = await sendAndConfirmTransaction(
                connection, 
                transaction, 
                [senderKeypair],  // The array of signers
                { commitment: "confirmed" }  // Commitment option in an object
            );
            decreaseSolBalanceForWallet(chatId, activeIndex, solAmount);
    
            bot.sendMessage(chatId, `✅ *Withdrawal Successful!*\n🔗 [View on Solscan](https://solscan.io/tx/${txSignature})`, { parse_mode: "Markdown" });
    
        } catch (error) {
            console.error("❌ Withdrawal Error:", error);
            bot.sendMessage(chatId, "❌ Withdrawal failed. Please try again.");
        }
    } else if (data === "custom_sol"){
        bot.sendMessage(chatId, "💰 Enter the amount of SOL you want to use for the trade:");

        bot.once("message", async (msg) => {
            const solAmount = parseFloat(msg.text.trim());

            if (isNaN(solAmount) || solAmount <= 0) {
                return bot.sendMessage(chatId, "❌ Invalid SOL amount. Please enter a positive number.");
            }

            // Store the custom amount for this user
            if (!userBuyData[chatId]) userBuyData[chatId] = {};
            userBuyData[chatId].solAmount = solAmount;

            // Refresh the buy window with updated values
            refreshBuyWindow(chatId, messageId);
        });
    } else if(data === "custom_slippage"){
        bot.sendMessage(chatId, "🔄 Enter your preferred slippage percentage (e.g., 0.5 for 0.5%):");

        bot.once("message", async (msg) => {
            const slippage = parseFloat(msg.text.trim());

            if (isNaN(slippage) || slippage <= 0 || slippage > 100) {
                return bot.sendMessage(chatId, "❌ Invalid slippage. Please enter a number between 0.1 and 100.");
            }

            // Store the custom slippage for this user
            if (!userBuyData[chatId]) userBuyData[chatId] = {};
            userBuyData[chatId].slippage = slippage;

            // Refresh the buy window with updated values
            refreshBuyWindow(chatId, messageId);
        });
    } else if (data.startsWith("confirm_buy_")){
        const outputMint = data.split("_")[2]; // Extract token mint
        bot.sendMessage(chatId, `🔄 Your buy is being processed. This may take a few seconds...`, {
            parse_mode: "Markdown",
        });
        const inputMint = process.env.SOLANA_ADDRESS;
        // Ensure userBuyData[chatId] exists
        if (!userBuyData[chatId]) userBuyData[chatId] = {};

        // Set default values if they are missing
        const solAmount = userBuyData[chatId].solAmount || 0.01;
        const slippage = userBuyData[chatId].slippage || 5;
        const adjustedAmount = Math.floor(solAmount * LAMPORTS_PER_SOL); // Convert to lamports
        const adjustedSlippage = slippage * 100;
        //adjustedAmount = amount * Math.pow(10, inputTokenInfo.decimals);

        // Get Active Wallet
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const privatKey = userWallet.privateKeyBase58;
        const keypair = Keypair.fromSecretKey(bs58.decode(privatKey));
        const publicKey = keypair.publicKey;
        let buySignature;
        try {
            buySignature = await performSwapBuy(inputMint, solAmount, outputMint, connection, adjustedSlippage, privatKey, chatId)
            bot.sendMessage(chatId, `✅ Swap Successful!\n🔗 [View on Solscan](https://solscan.io/tx/${buySignature}/)`);

        } catch (error) {
            console.error("❌ Swap Error:", error);
            bot.sendMessage(chatId, "❌ Swap failed. Please try again.");
        }
        try {
            const filePath = `./data/${chatId}.json`;
            const debugFilePath = `./data/${chatId}_debug.json`;
        
            const { tokenAmount, solSpentLamports } = await getBuyTransactionDetails(
                connection,
                keypair.publicKey,
                outputMint,
                buySignature
            );
        
            // ✅ Subtract actual SOL spent
            decreaseSolBalanceForWallet(chatId, activeIndex, solSpentLamports);
        
            // ✅ Store token with accurate data
            await storeTokenData(
                outputMint,
                filePath,
                tokenAmount,
                debugFilePath,
                solSpentLamports,
                userBuyData[chatId].tokenSymbol
            );
        } catch (error) {
            console.warn("⚠️ Failed to finalize buy transaction:", error);
        }
        userBuyData[chatId].tokenSymbol
        let tmpBuySolAmount = userBuyData[chatId]?.solAmount; // Default solAmount
        let tmpBuySlippage = userBuyData[chatId]?.slippage; // Default slippage (use ?? to allow 0 as valid)        
        delete userBuyData[chatId];
        userBuyData[chatId] = { solAmount: tmpBuySolAmount, slippage : tmpBuySlippage }; // Recreate chatId object with only solAmount
        

    } else if (data === "sell") {
        if (!wallets[chatId] || !wallets[chatId].wallets || wallets[chatId].wallets.length === 0) {
            return bot.sendMessage(chatId, "🚨 You need to create a wallet first.");
        }
    
        const activeIndex = wallets[chatId].activeWallet || 0; // Default to W1
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = userWallet.publicKey;
    
        showSellMenu(chatId);
    } else if (data.startsWith("sell_")) {
        const tokenMint = data.split("_")[1]; // Extract token mint
    
        console.log(`🔹 User selected to sell token: ${tokenMint}`);
    
        // Fetch sell price and show UI
        fetchSellPrice(chatId, tokenMint);
    } else if (data.startsWith("pct_sell_")) {
        const parts = data.split("_").filter(part => part !== ""); // Remove empty parts caused by "__"
        
        if (parts.length < 3) {
            return bot.sendMessage(chatId, "❌ Invalid selection data. Please try again.");
        }
    
        const percentage = parseInt(parts[2]); // Correctly extract percentage
        const tokenMint = parts.slice(3).join("_"); // Correctly extract tokenMint
    
        console.log(`🔹 User selected to sell ${percentage}% of token: ${tokenMint}`);
    
        if (!userSellData[chatId] || userSellData[chatId].tokenMint !== tokenMint) {
            return bot.sendMessage(chatId, "❌ Token data missing. Please try again.");
        }
    
        // Store the selected percentage
        userSellData[chatId].selectedPercentage = percentage;
        userSellData[chatId].sellAmount = (userSellData[chatId].tokenBalance * percentage) / 100;
    
        // Refresh UI with updated selection
        fetchSellPrice(chatId, tokenMint);
    } else if (data === "custom_sell_slippage") {
        bot.sendMessage(chatId, "🔄 *Enter your preferred slippage percentage (e.g., 0.5 for 0.5%):*", { parse_mode: "Markdown" });

        bot.once("message", async (msg) => {
            const slippage = parseFloat(msg.text.trim());

            if (isNaN(slippage) || slippage <= 0 || slippage > 100) {
                return bot.sendMessage(chatId, "❌ Invalid slippage. Please enter a number between 0.1 and 100.");
            }

            // Store new slippage
            if (!userSellData[chatId]) userSellData[chatId] = {};
            userSellData[chatId].slippage = slippage;

            // Refresh UI
            fetchSellPrice(chatId, userSellData[chatId].tokenMint);
        });
    }
    else if (data.startsWith("confirm_sell_")){
        const inputMint = data.split("_")[2]; // Extract token mint
        const outputMint = process.env.SOLANA_ADDRESS;
        // Ensure userBuyData[chatId] exists
        if (!userSellData[chatId]) userSellData[chatId] = {};
        bot.sendMessage(chatId, `🔄 Your Sell is being processed. This may take a few seconds...`, {
            parse_mode: "Markdown",
        });

        // Set default values if they are missing
        const tokenAmount = Math.floor(userSellData[chatId].sellTokenAmount || 0.01);
        const slippage = userSellData[chatId].slippage || 5;
        const adjustedSlippage = slippage * 100;
        //adjustedAmount = amount * Math.pow(10, inputTokenInfo.decimals);

        // Get Active Wallet
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = new PublicKey(userWallet.publicKey);
        const privatKey = bs58.decode(userWallet.privateKeyBase58);
        const keypair = Keypair.fromSecretKey(privatKey);

        bot.sendMessage(chatId, `🔄 *Processing SELL Order*\n\n💰 Token Amount: *${userSellData[chatId].tokenBalance}*\n🔄 Slippage: *${slippage}%*\n\nFetching the best swap route and process the swap...`, {
            parse_mode: "Markdown"
        });
        let sellSignature;
        try {
            sellSignature = await performSwapSell(inputMint, tokenAmount, outputMint, connection, adjustedSlippage, userWallet.privateKeyBase58, chatId);
            bot.sendMessage(chatId, `✅ Swap Successful!\n🔗 [View on Solscan](https://solscan.io/tx/${sellSignature}/)`);
                
        } catch (error) {
            console.error("❌ Swap Error:", error);
            bot.sendMessage(chatId, "❌ Swap failed. Please try again.");
        }
        try {
            //await storeAmmTokenData(outputMint, filePath, priceInSol);
            const filePath = `./data/${chatId}.json`; // main token data
            const { solReceivedLamports, newTokenBalance } = await getSellTransactionDetails(connection, keypair.publicKey, inputMint, sellSignature);
            await increaseSolBalanceForWallet(chatId, activeIndex, solReceivedLamports);
            const removeToken = await updateTokenData(inputMint, filePath, newTokenBalance);
        } catch (error) {
            console.warn("⚠️ Failed to store token data:", error);
        }
        
        delete userSellData[chatId];


    } else if (data === "positions") {
        bot.sendMessage(chatId, "🔎 Fetching your open positions...");
        showPositionMenu(bot, chatId, wallets[chatId]);
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
        try {
            const activeIndex = wallets[chatId].activeWallet || 0;
            const userWallet = wallets[chatId].wallets[activeIndex];
            const publicKey = userWallet.publicKey;
            const balanceLamports = userWallet.solBalanceLamports || 0;
            const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
    
            let withdrawText = `💸 *Withdraw $SOL* — (Solana)  
    📄 *Balance:* ${balanceSol.toFixed(4)} SOL`;
    
            const selectedPercentage = userWithdrawData[chatId]?.selectedPercentage || "Not Set"; // Default 100%
    
            // Construct withdraw menu
            const withdrawMenu = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "⬅️ Back", callback_data: "main_menu" }, { text: "🔄 Refresh", callback_data: "withdraw" }],
                        [
                            { text: `${selectedPercentage === 50 ? "✅" : ""} 50 %`, callback_data: "withdraw_50" },
                            { text: `${selectedPercentage === 100 ? "✅" : ""} 100 %`, callback_data: "withdraw_100" }
                        ],
                        [{ text: "✏️ X SOL", callback_data: "custom_withdraw_amount" }],
                        [{ text: "🏦 Set Withdrawal Address", callback_data: "set_withdrawal_address" }]
                    ]
                }
            };
    
            bot.editMessageText(withdrawText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                ...withdrawMenu
            });
    
        } catch (error) {
            bot.sendMessage(chatId, "❌ Error fetching balance.");
            console.error("❌ Withdraw Menu Error:", error.message);
        }
    }else if (data.startsWith("set_active_wallet_")) {
        const walletIndex = parseInt(data.split("_")[3]); // Extract wallet index
    
        if (!wallets[chatId] || !wallets[chatId].wallets[walletIndex]) {
            return bot.sendMessage(chatId, "❌ Invalid wallet selection.");
        }
    
        // Set the active wallet index
        wallets[chatId].activeWallet = walletIndex;
    
        // Save updated wallets object
        saveWallets(wallets); // ✅ FIXED
    
        // Give feedback & refresh menu
        bot.answerCallbackQuery(query.id, { text: `✅ Wallet W${walletIndex + 1} is now active!` });
        bot.emit("callback_query", { ...query, data: "wallets" }); // Re-render wallets menu
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
    } else if (data === "wallets") {
        await showWalletsMenu(bot, chatId, messageId, connection)
    } else if (data === "refresh_balances") {
        await bot.editMessageText("🔄 Refreshing all wallet balances...", {
            chat_id: chatId,
            message_id: messageId
        });
    
        await refreshAllBalances(chatId, connection);
        //Just for debugging
        await refreshAllBalancesGlobal(connection);
        await showWalletsMenu(bot, chatId, messageId, connection);
    } else if (data === "create_wallet") {
        let max_Wallets = 12;
    
        if (!wallets[chatId]) {
            wallets[chatId] = { wallets: [], activeWallet: 0 };
        }
    
        if (wallets[chatId].wallets.length >= max_Wallets) {
            return bot.sendMessage(chatId, `🚨 You can only create up to ${max_Wallets} wallets.`);
        }
    
        const newWallet = Keypair.generate();
        const privateKeyBase58 = bs58.encode(newWallet.secretKey);
        const publicKey = newWallet.publicKey;
        const walletLabel = `W${wallets[chatId].wallets.length + 1}`;
    
        wallets[chatId].wallets.push({
            label: walletLabel,
            privateKeyBase58,
            publicKey,
            solBalanceLamports: 0
        });
    
        saveWallets(wallets); // ✅ FIXED
    
        bot.sendMessage(
            chatId,
            `✅ *New Wallet Created!*\n\n🗝 *Public Key:* \`${publicKey}\`\n📛 *Label:* ${walletLabel}\n🔒 *Private Key:* [Stored Securely]`,
            { parse_mode: "Markdown" }
        );
    } else if (data === "help") {
        bot.sendMessage(chatId, "❓ How can I help you?");
    } else if (data === "export_privateKey") {
        bot.sendMessage(chatId, "Are you sure you want to export your private key?", {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Cancel", callback_data: "cancel" },
                        { text: "Show Private Keys", callback_data: "show_private_keys" }
                    ]
                ]
            }
        });
    } else if (data === "show_private_keys") {
        // Get the active wallet
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const privateKey = userWallet.privateKeyBase58; // Replace with the actual key securely

        bot.sendMessage(chatId, `*Secret Key*\n\`${privateKey}\`\n(Tap to copy)`, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Cancel", callback_data: "delete_private_key_message" }]
                ]
            }
        });        // Add logic to display the private key securely if necessary
    } else if (data === "cancel" || data === "delete_private_key_message") {
        bot.deleteMessage(chatId, messageId); // Delete the message instead of sending a cancel response
    } else if (data === "main_menu") {

        // if (!allowedUsers.includes(chatId)) {
        //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
        // }
    
        try {
            // Ensure wallets exist for the user
            if (!wallets[chatId] ||  wallets[chatId].wallets.length === 0) {
                console.log(`Creating a new wallet for user: ${chatId}`);

                const newWallet = Keypair.generate();
                wallets[chatId] = {
                    activeWallet: 0,  // Default first wallet as active
                    wallets: [{
                        label: "W1",
                        privateKeyBase58: bs58.encode(newWallet.secretKey),
                        publicKey: newWallet.publicKey,
                        solBalanceLamports: 0
                    }]
                };

                saveWallets(wallets); // ✅ pass the global object
            }

            // Get the active wallet
            const activeIndex = wallets[chatId].activeWallet || 0;
            const userWallet = wallets[chatId].wallets[activeIndex];
            const publicKey = userWallet.publicKey;
    
            // Fetch balance
            const balanceLamports = userWallet.solBalanceLamports || 0;
            const balanceSol = balanceLamports / LAMPORTS_PER_SOL;                      
    
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🟢 Buy", callback_data: "buy" }, { text: "🔴 Sell", callback_data: "sell" }],
                        [{ text: "📊 Positions", callback_data: "positions" }],// { text: "📈 Limit Orders", callback_data: "limit_orders" }, { text: "📉 DCA Orders", callback_data: "dca_orders" }],
                        //[{ text: "📎 Copy Trade", callback_data: "copy_trade" }, { text: "🎯 Sniper", callback_data: "sniper" }],
                        //[{ text: "⚔️ Trenches", callback_data: "trenches" }, { text: "👥 Referrals", callback_data: "referrals" }, { text: "⭐ Watchlist", callback_data: "watchlist" }],
                        [{ text: "👛 Wallets", callback_data: "wallets" }, { text: "💸 Withdraw", callback_data: "withdraw" }]
                        //[{ text: "💸 Withdraw", callback_data: "withdraw" }], { text: "👛 Wallets", callback_data: "wallets" }],
                        //[{ text: "❓ Help", callback_data: "help" }, { text: "🔄 Refresh", callback_data: "refresh" }]
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
            
            // Send the message
            bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...options });
    } catch (error) {
        bot.sendMessage(chatId, "❌ Error /start.");
    }
    }

    bot.answerCallbackQuery(query.id);
});


// Trade on Solana with myBuyBot
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }

    try {
        // Ensure wallets exist for the user
        if (!wallets[chatId] ||  wallets[chatId].wallets.length === 0) {
            console.log(`Creating a new wallet for user: ${chatId}`);

            const newWallet = Keypair.generate();
            wallets[chatId] = {
                activeWallet: 0,  // Default first wallet as active
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

        // Fetch balance
        const balanceLamports = userWallet.solBalanceLamports || 0;
        const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🟢 Buy", callback_data: "buy" }, { text: "🔴 Sell", callback_data: "sell" }],
                    [{ text: "📊 Positions", callback_data: "positions" }],// { text: "📈 Limit Orders", callback_data: "limit_orders" }, { text: "📉 DCA Orders", callback_data: "dca_orders" }],
                    //[{ text: "📎 Copy Trade", callback_data: "copy_trade" }, { text: "🎯 Sniper", callback_data: "sniper" }],
                    //[{ text: "⚔️ Trenches", callback_data: "trenches" }, { text: "👥 Referrals", callback_data: "referrals" }, { text: "⭐ Watchlist", callback_data: "watchlist" }],
                    [{ text: "👛 Wallets", callback_data: "wallets" }, { text: "💸 Withdraw", callback_data: "withdraw" }],
                    //[{ text: "👛 Wallets", callback_data: "wallets" }]
                    //[{ text: "❓ Help", callback_data: "help" }, { text: "🔄 Refresh", callback_data: "refresh" }]
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
        
        // Send the message
        bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...options });
        

    } catch (error) {
        bot.sendMessage(chatId, "❌ Error /start.");
    }
});

// Check SOL balance of current wallet
bot.onText(/\/balance/, async (msg) => {
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(msg.chat.id, "🚫 Access denied. You are not authorized to use this bot.");
    // }
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
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }
    bot.sendMessage(chatId, "Message Buy coming soon!\n");
})
// Sell a token
bot.onText(/\/sell/, async (msg) => {
    const chatId = msg.chat.id;
    if (!wallets[chatId] || !wallets[chatId].wallets || wallets[chatId].wallets.length === 0) {
        return bot.sendMessage(chatId, "🚨 You need to create a wallet first.");
    }

    const activeIndex = wallets[chatId].activeWallet || 0; // Default to W1
    const userWallet = wallets[chatId].wallets[activeIndex];
    const publicKey = userWallet.publicKey;

    showSellMenu(chatId);
})
// View detailed information about your tokens
bot.onText(/\/positions/, async (msg) => {
    const chatId = msg.chat.id;
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }
    bot.sendMessage(chatId, "positions coming soon!\n");
})
// Configure your settings
bot.onText(/\/settings/, async (msg) => {
    const chatId = msg.chat.id;
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }
    bot.sendMessage(chatId, "settings coming soon!\n");
})
// Snipe [CA]
bot.onText(/\/snipe/, async (msg) => {
    const chatId = msg.chat.id;
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }
    bot.sendMessage(chatId, "snipe coming soon!\n");
})
// Burn unwanted tokens to claim SOL
bot.onText(/\/burn/, async (msg) => {
    const chatId = msg.chat.id;
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }
    bot.sendMessage(chatId, "burn coming soon!\n");
})
// Withdraw tokens or SOL
bot.onText(/\/withdraw/, async (msg) => {
    const chatId = msg.chat.id;
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }
    bot.sendMessage(chatId, "Message withdraw coming soon!\n");
})
// FAQ and Telegram channel
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }
    bot.sendMessage(chatId, "help coming soon!\n");
})
// Backup bots in case of lag or issues
bot.onText(/\/backup/, async (msg) => {
    const chatId = msg.chat.id;
    // if (!allowedUsers.includes(msg.from.id)) {
    //     return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    // }
    bot.sendMessage(chatId, "backup coming soon!\n");
})

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    // Check if the message contains text
    if (!msg.text) {
        bot.sendMessage(chatId, "I only process text messages.");
        return;
    }
    const text = msg.text.trim();

    // Check if user is in "custom withdraw amount" mode
    if (userWithdrawData[chatId]?.awaitingAmount) {
        const solAmount = parseFloat(text);
        if (isNaN(solAmount) || solAmount <= 0) {
            return bot.sendMessage(chatId, "❌ Invalid amount. Please enter a valid SOL amount.");
        }

        // Store user input & reset mode
        userWithdrawData[chatId].solAmount = solAmount;
        userWithdrawData[chatId].awaitingAmount = false;

        // Refresh Withdraw Menu with updated amount
        return showWithdrawMenu(chatId);
    }
});

async function refreshWithdrawMenu(chatId, messageId) {
    const activeIndex = wallets[chatId].activeWallet || 0;
    const userWallet = wallets[chatId].wallets[activeIndex];
    const publicKey = userWallet.publicKey;
    const balance = await checkWallet(publicKey, connection);

    let solAmount = userWithdrawData[chatId]?.solAmount || "X";  // Default "X"
    let withdrawalAddress = userWithdrawData[chatId]?.withdrawalAddress || "Not Set";
    const selectedPercentage = userWithdrawData[chatId]?.selectedPercentage || "Not Set"; // Default 100%

    // ✅ Prevent division error: Only divide if solAmount is a valid number
    let formattedAmount = (typeof solAmount === "number") ? (solAmount / LAMPORTS_PER_SOL).toFixed(4) : "X";

    let withdrawText = `💸 *Withdraw $SOL* — (Solana)  
📄 *Balance:* ${balance.toFixed(4)} SOL  
💰 *Amount:* ${formattedAmount} SOL  
🏦 *To:* \`${withdrawalAddress}\``;

    let withdrawMenuButtons = [
        [{ text: "⬅️ Back", callback_data: "main_menu" }, { text: "🔄 Refresh", callback_data: "withdraw" }],
        [
            { text: `${selectedPercentage === 50 ? "✅" : "🔹"} 50%`, callback_data: "withdraw_50" },
            { text: `${selectedPercentage === 100 ? "✅" : "🔹"} 100%`, callback_data: "withdraw_100" }
        ],
        [{ text: `✏️ ${formattedAmount} SOL`, callback_data: "custom_withdraw_amount" }],
        [{ text: `🏦 ${withdrawalAddress === "Not Set" ? "Set" : "Change"} Withdrawal Address`, callback_data: "set_withdrawal_address" }]
    ];

    // ✅ Update the original withdraw menu message (without the Withdraw button)
    bot.editMessageText(withdrawText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: withdrawMenuButtons }
    });

    // ✅ If both SOL amount and withdrawal address are set, send a **new message** with the Withdraw button
    if (solAmount !== "X" && withdrawalAddress !== "Not Set") {
        const withdrawConfirmationText = `💸 *Confirm Withdrawal*
✅ *Active Wallet:* W${activeIndex + 1}     
📄 *Balance:* ${balance.toFixed(4)} SOL  
💰 *Amount:* ${(solAmount/LAMPORTS_PER_SOL).toFixed(4)} SOL  
🏦 *To:* \`${withdrawalAddress}\``;

        await bot.sendMessage(chatId, withdrawConfirmationText, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [[{ text: "✅ WITHDRAW", callback_data: "confirm_withdraw" }]]
            }
        });
    }
}

console.log("Telegram bot is running...");