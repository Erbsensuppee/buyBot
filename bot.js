require('dotenv').config();
const axios = require("axios");
const TelegramBot = require('node-telegram-bot-api');
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58'); // Base58 encoding/decoding
const { checkWallet } = require("./src/checkWallet.js"); 
const {getQuote, getSwapInstructions, getSwapResponse} = require("./src/jupiterApi.js")
const fs = require('fs');
const { getAccount } = require("@solana/spl-token");
const { getAddressLookupTableAccounts, simulateTransaction, getAveragePriorityFee, createVersionedTransaction, deserializeInstruction } = require("./src/utils.js")
const { createJitoBundle, sendJitoBundle, bundleSignature, checkBundleStatus } = require("./src/jitoService.js")


const allowedUsers= [1778595492];
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const connection = new Connection(process.env.HELIUS_RPC_URL);
// Store user-specific buy data (custom SOL amount, slippage, token mint, etc.)
const userBuyData = {}; 
const userSellData = {};

// Load existing wallets or create an empty object
const WALLET_FILE = "wallets.json";
let wallets = [];
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
            publicKey: newWallet.publicKey
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
        const tokenInformations = response2.data;
        const price = tokenData.price || 0;
        const liquidity = tokenData.liquidity || "N/A";
        const marketCap = tokenData.marketCap || "N/A";

        // Fetch the user's active wallet balance
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = userWallet.publicKey;

        // Ensure userBuyData[chatId] exists before accessing solAmount
        if (!userBuyData[chatId]) {
            userBuyData[chatId] = {};  // Initialize it to an empty object if undefined
        }

        let solAmount = userBuyData[chatId].solAmount || 0.001;
        let slippage = userBuyData[chatId].slippage || 0.5;
        const balance = await checkWallet(publicKey, connection);

        // Show swap details
        const priceImpact = (tokenData.priceImpact || 0) * 100;
        const solToTokenRate = 1 / price;

        let message = `🪙 *Token Found!*\n\n`;
        message += `Buy *$${tokenInformations.symbol}*\n\`${tokenMint}\`\n`;
        message += `💰 *SOL Amount:* ${solAmount} SOL\n`;
        message += `🔄 *Slippage:* ${slippage}%\n`;
        message += `📊 *Price:* $${price}\n`;
        //message += `📊 *Price:* $${price} — LIQ: *$${liquidity}* — MC: *$${marketCap}\n`;
        message += `⚖️ *${solAmount} SOL → ${solToTokenRate.toFixed(2)} ${tokenData.mint}*\n`;
        //message += `📉 *Price Impact:* ${priceImpact.toFixed(2)}%\n`;

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
        const tokenInformations = response2.data;
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
        const tmpSellAmount = Number(accountInfo.amount);

        const tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        const slippage = userSellData[chatId]?.slippage || 0.5;
        const selectedPercentage = userSellData[chatId]?.selectedPercentage || 0; // Default: No selection

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

        // Store the token info for this user
        if (!userSellData[chatId]) userSellData[chatId] = {};
        userSellData[chatId].tokenMint = tokenMint;
        userSellData[chatId].tokenSymbol = tokenInformations.symbol;
        userSellData[chatId].tokenBalance = tokenBalance;
        userSellData[chatId].slippage = slippage;
        userSellData[chatId].sellTokenAmount = selectedAmount;

        let message = `🪙 *Token Found!*\n\n`;
        message += `Sell *$${tokenInformations.symbol}*\n\`${tokenMint}\`\n`;
        message += `💰 *Balance:* ${tokenBalance.toFixed(4)} ${tokenInformations.symbol}\n`;
        message += `🔄 *Slippage:* ${slippage}%\n`;
        message += `📊 *Price:* $${price}\n`;
        message += `*Sell Token Amount:* ${selectedHumanAmount}`;


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

    const tokenMint = userBuyData[chatId].tokenMint;
    const solAmount = userBuyData[chatId].solAmount || 0.5; // Default to 0.5 SOL
    const slippage = userBuyData[chatId].slippage || 0.5; // Default to 0.5%

    // Fetch token price again
    const response = await axios.get(`https://api.jup.ag/price/v2?ids=${tokenMint},${process.env.SOLANA_ADDRESS}`);
    if (!response.data || !response.data.data[tokenMint]) {
        return bot.sendMessage(chatId, "❌ Token not found on Jupiter. Please try again.");
    }

    const activeIndex = wallets[chatId].activeWallet || 0;
    const tokenData = response.data.data[tokenMint];
    const price = tokenData.price || 0;
    const solToTokenRate = solAmount / price;
    const priceImpact = (tokenData.priceImpact || 0) * 100;

    let message = `🪙 *Token Found!*\n\n`;
    message += `Buy *$${tokenData.symbol}*\n\`${tokenMint}\`\n`;
    message += `💰 *SOL Amount:* ${solAmount} SOL\n`;
    message += `🔄 *Slippage:* ${slippage}%\n`;
    message += `📊 *Price:* $${price}\n`;
    message += `⚖️ *${solAmount} SOL → ${solToTokenRate.toFixed(2)} ${tokenData.mint}*\n`;
    message += `📉 *Price Impact:* ${priceImpact.toFixed(2)}%\n`;

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

async function getUserTokens(chatId, publicKey) {
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
            { text: `${token.symbol}`, callback_data: `sell_${token.mint}` }
        ]);

        // Add navigation buttons
        buttons.push([{ text: "⬅️ Back", callback_data: "main_menu" }, { text: "🔄 Refresh", callback_data: "sell_menu" }]);

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
    const text = msg.text.trim();

    // Ignore commands (messages that start with "/")
    if (text.startsWith("/")) {
        return;
    }

    // Check if the text is a valid Solana token mint address
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

    if (!allowedUsers.includes(chatId)) {
        return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
    }

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

        // Step 2: Capture user's response (next message)
        bot.once("message", async (msg) => {
            const tokenInput = msg.text.trim();

            // Validate input
            if (!isValidSolanaAddress(tokenInput) && tokenInput.length > 10) {
                return bot.sendMessage(chatId, "❌ Invalid token address. Please enter a correct Solana token address or symbol.");
            }

            // Proceed to fetch price
            const tokenSymbol = tokenInput;
            await fetchTokenPrice(chatId, tokenSymbol);
        });
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
        const inputMint = process.env.SOLANA_ADDRESS;
        // Ensure userBuyData[chatId] exists
        if (!userBuyData[chatId]) userBuyData[chatId] = {};

        // Set default values if they are missing
        const solAmount = userBuyData[chatId].solAmount || 0.001;
        const slippage = userBuyData[chatId].slippage || 50;
        const adjustedAmount = Math.floor(solAmount * LAMPORTS_PER_SOL); // Convert to lamports
        const adjustedSlippage = slippage * 100;
        //adjustedAmount = amount * Math.pow(10, inputTokenInfo.decimals);

        // Get Active Wallet
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = new PublicKey(userWallet.publicKey);
        const keypair = Keypair.fromSecretKey(bs58.decode(userWallet.privateKeyBase58));

        try {
            // 1. Get quote from Jupiter
            console.log("💰 Getting quote from Jupiter...");
            const quoteResponse = await getQuote(
                inputMint,
                outputMint,
                adjustedAmount,
                adjustedSlippage
            );
        
            if (!quoteResponse || !quoteResponse.routePlan) {
                return bot.sendMessage(chatId, "❌ No trading routes found. Please try again.");
            }
        
            console.log("🔄 Quote received. Fetching swap instructions...");
        
            // 2. Get swap instructions
            const swapInstructions = await getSwapInstructions(
                quoteResponse,
                publicKey.toString()
            );
        
            if (!swapInstructions || swapInstructions.error) {
                return bot.sendMessage(chatId, "❌ Failed to get swap instructions. Please try again.");
            }
        
            console.log("📜 Swap instructions received. Preparing transaction...");
        
            // 3. Prepare Transaction
            const {
                setupInstructions,
                swapInstruction: swapInstructionPayload,
                cleanupInstruction,
                addressLookupTableAddresses,
            } = swapInstructions;
        
            const swapInstruction = deserializeInstruction(swapInstructionPayload);
            
            const addressLookupTableAccounts = await getAddressLookupTableAccounts(
                addressLookupTableAddresses,
                connection
            );

            const latestBlockhash = await connection.getLatestBlockhash("finalized");

            // 4. Simulate transaction to get compute units
            const instructions = [
                ...setupInstructions.map(deserializeInstruction),
                swapInstruction,
            ];
        
            if (cleanupInstruction) {
                instructions.push(deserializeInstruction(cleanupInstruction));
            }
        
            const computeUnits = await simulateTransaction(
                instructions,
                keypair.publicKey,
                addressLookupTableAccounts,
                2,
                connection
              );

            if (computeUnits === undefined) {
                return bot.sendMessage(chatId, `⚠️ Simulation Failed \n❌ Swap will not proceed.`, {
                    parse_mode: "Markdown",
                });
            } else if(computeUnits && computeUnits.error === "InsufficientFundsForRent") {
                console.log("❌ Insufficient funds for rent. Skipping this swap.");
                return bot.sendMessage(chatId, `❌ Insufficient funds for rent. Skipping this swap."`, {
                    parse_mode: "Markdown",
                });
            } else {
                bot.sendMessage(chatId, `✅ *Simulation Successful!*\n\n🔹}🔹 Will proceed with swap execution.`, {
                    parse_mode: "Markdown",
                });
            }
        
            const priorityFee = await getAveragePriorityFee(connection);

            // 5. Create versioned transaction
            const transaction = createVersionedTransaction(
                instructions,
                keypair.publicKey,
                addressLookupTableAccounts,
                latestBlockhash.blockhash,
                computeUnits,
                priorityFee
            );
        
            console.log("✍️ Signing transaction...");
            // 6. Sign the transaction
            transaction.sign([keypair]);
        

            // 7. Create and send Jito bundle
            console.log("\n📦 Creating Jito bundle...");
            const jitoBundle = await createJitoBundle(transaction, keypair, connection);
            console.log("✅ Jito bundle created successfully");

            // Answer callback query immediately
            bot.answerCallbackQuery(query.id, { text: "⏳ Processing swap...", show_alert: false });

            // Send an immediate response to inform the user
            bot.sendMessage(chatId, "🔄 Your transaction is being processed. This may take a few seconds...");


            // console.log("\n📤 Sending Jito bundle...");
            let bundleId = await sendJitoBundle(jitoBundle);
            console.log(`✅ Jito bundle sent. Bundle ID: ${bundleId}`);

            console.log("\n🔍 Checking Bundle status...");
            let bundleStatus = null;
            let bundleRetries = 10;
            const delay = 1000; // Wait 1 second per retry
            
            if (!bundleId || typeof bundleId !== "string" || bundleId.trim() === "") {
                console.error("❌ Swap Error: Invalid bundle ID. Cannot check status.");
                return bot.sendMessage(chatId, "❌ Transaction failed. Invalid bundle ID received.");
            }
            
            // Proceed only if bundleId is valid
            while (bundleRetries > 0) {
                console.log(`⏳ Waiting for 1 second before checking bundle status...`);
                await new Promise((resolve) => setTimeout(resolve, delay));

                try {
                    bundleStatus = await checkBundleStatus(bundleId);

                    if (bundleStatus) {
                        console.log(`📦 Bundle Status: ${bundleStatus.status}`);

                        if (bundleStatus.status === "finalized") {
                            console.log(`✅ Bundle ${bundleId} landed in slot ${bundleStatus.landedSlot}`);
                            bot.sendMessage(chatId, `✅ Swap Successful!\n🔗 [View on Solscan](https://solscan.io/tx/${bundleStatus.transactionId}/)`);
                            break;
                        } else if (bundleStatus.status === "processed") {
                            bot.sendMessage(chatId, "⌛ Your swap is processed...");
                        } else if (bundleStatus.status === "confirmed") {
                            bot.sendMessage(chatId, `✅ Swap Successful!\n🔗 [View on Solscan](https://solscan.io/tx/${bundleStatus.transactionId}/)`);
                            break;
                        }else if (!bundleStatus.status) {
                            return bot.sendMessage(chatId, "❌ Swap failed. Please try again.");                        }
                    } else {
                        console.log("⚠️ No valid response for bundle status. Retrying...");
                    }

                    bundleRetries--;
                } catch (statusError) {
                    console.error("❌ Error fetching bundle status:", statusError.message);
                }
            }
        
        } catch (error) {
            console.error("❌ Swap Error:", error);
            bot.sendMessage(chatId, "❌ Swap failed. Please try again.");
        }
        
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

        // Set default values if they are missing
        const tokenAmount = Math.floor(userSellData[chatId].sellTokenAmount || 0.001);
        const slippage = userSellData[chatId].slippage || 50;
        const adjustedSlippage = slippage * 100;
        //adjustedAmount = amount * Math.pow(10, inputTokenInfo.decimals);

        // Get Active Wallet
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = new PublicKey(userWallet.publicKey);
        const keypair = Keypair.fromSecretKey(bs58.decode(userWallet.privateKeyBase58));

        bot.sendMessage(chatId, `🔄 *Processing SELL Order*\n\n💰 Token Amount: *${userSellData[chatId].tokenBalance}*\n🔄 Slippage: *${slippage}%*\n\nFetching the best swap route and process the swap...`, {
            parse_mode: "Markdown"
        });

        try {
            // 1. Get quote from Jupiter
            console.log("💰 Getting quote from Jupiter...");
            const quoteResponse = await getQuote(
                inputMint,
                outputMint,
                tokenAmount,
                adjustedSlippage
            );
        
            if (!quoteResponse || !quoteResponse.routePlan) {
                return bot.sendMessage(chatId, "❌ No trading routes found. Please try again.");
            }
        
            console.log("🔄 Quote received. Fetching swap instructions...");
        
            // 2. Get swap instructions
            const swapInstructions = await getSwapInstructions(
                quoteResponse,
                publicKey.toString()
            );
        
            if (!swapInstructions || swapInstructions.error) {
                return bot.sendMessage(chatId, "❌ Failed to get swap instructions. Please try again.");
            }
        
            console.log("📜 Swap instructions received. Preparing transaction...");
        
            // 3. Prepare Transaction
            const {
                setupInstructions,
                swapInstruction: swapInstructionPayload,
                cleanupInstruction,
                addressLookupTableAddresses,
            } = swapInstructions;
        
            const swapInstruction = deserializeInstruction(swapInstructionPayload);
            
            const addressLookupTableAccounts = await getAddressLookupTableAccounts(
                addressLookupTableAddresses,
                connection
            );

            const latestBlockhash = await connection.getLatestBlockhash("finalized");

            // 4. Simulate transaction to get compute units
            const instructions = [
                ...setupInstructions.map(deserializeInstruction),
                swapInstruction,
            ];
        
            if (cleanupInstruction) {
                instructions.push(deserializeInstruction(cleanupInstruction));
            }
        
            const computeUnits = await simulateTransaction(
                instructions,
                keypair.publicKey,
                addressLookupTableAccounts,
                2,
                connection
              );

            if (computeUnits === undefined) {
                return bot.sendMessage(chatId, `⚠️ Simulation Failed \n❌ Swap will not proceed.`, {
                    parse_mode: "Markdown",
                });
            } else if(computeUnits && computeUnits.error === "InsufficientFundsForRent") {
                console.log("❌ Insufficient funds for rent. Skipping this swap.");
                return bot.sendMessage(chatId, `❌ Insufficient funds for rent. Skipping this swap."`, {
                    parse_mode: "Markdown",
                });
            } else {
                bot.sendMessage(chatId, `✅ *Simulation Successful!*\n\n🔹Will proceed with swap execution.`, {
                    parse_mode: "Markdown",
                });
            }
        
            const priorityFee = await getAveragePriorityFee(connection);

            // 5. Create versioned transaction
            const transaction = createVersionedTransaction(
                instructions,
                keypair.publicKey,
                addressLookupTableAccounts,
                latestBlockhash.blockhash,
                computeUnits,
                priorityFee
            );
        
            console.log("✍️ Signing transaction...");
            // 6. Sign the transaction
            transaction.sign([keypair]);
        

            // 7. Create and send Jito bundle
            console.log("\n📦 Creating Jito bundle...");
            const jitoBundle = await createJitoBundle(transaction, keypair, connection);
            console.log("✅ Jito bundle created successfully");

            // Send an immediate response to inform the user
            bot.sendMessage(chatId, "🔄 Your transaction is being processed. This may take a few seconds...");


            // console.log("\n📤 Sending Jito bundle...");
            let bundleId = await sendJitoBundle(jitoBundle);
            console.log(`✅ Jito bundle sent. Bundle ID: ${bundleId}`);

            console.log("\n🔍 Checking Bundle status...");
            let bundleStatus = null;
            let bundleRetries = 10;
            const delay = 1000; // Wait 1 second per retry
            
            if (!bundleId || typeof bundleId !== "string" || bundleId.trim() === "") {
                console.error("❌ Swap Error: Invalid bundle ID. Cannot check status.");
                return bot.sendMessage(chatId, "❌ Transaction failed. Invalid bundle ID received.");
            }
            
            // Proceed only if bundleId is valid
            while (bundleRetries > 0) {
                console.log(`⏳ Waiting for 1 second before checking bundle status...`);
                await new Promise((resolve) => setTimeout(resolve, delay));

                try {
                    bundleStatus = await checkBundleStatus(bundleId);

                    if (bundleStatus) {
                        console.log(`📦 Bundle Status: ${bundleStatus.status}`);

                        if (bundleStatus.status === "finalized") {
                            console.log(`✅ Bundle ${bundleId} landed in slot ${bundleStatus.landedSlot}`);
                            bot.sendMessage(chatId, `✅ Swap Successful!\n🔗 [View on Solscan](https://solscan.io/tx/${bundleStatus.transactionId}/)`);
                            break;
                        } else if (bundleStatus.status === "processed") {
                            bot.sendMessage(chatId, "⌛ Your swap is processed...");
                        } else if (bundleStatus.status === "confirmed") {
                            bot.sendMessage(chatId, `✅ Swap Successful!\n🔗 [View on Solscan](https://solscan.io/tx/${bundleStatus.transactionId}/)`);
                            break;                        
                        }else if (!bundleStatus.status) {
                            return bot.sendMessage(chatId, "❌ Swap failed. Please try again.");                        }
                    } else {
                        console.log("⚠️ No valid response for bundle status. Retrying...");
                    }


                    bundleRetries--;
                } catch (statusError) {
                    console.error("❌ Error fetching bundle status:", statusError.message);
                }
            }
                    
        } catch (error) {
            console.error("❌ Swap Error:", error);
            bot.sendMessage(chatId, "❌ Swap failed. Please try again.");
        }
        
        
        
        delete userSellData[chatId];


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
    }else if (data.startsWith("set_active_wallet_")) {
        const walletIndex = parseInt(data.split("_")[3]); // Extract wallet index
        if (!wallets[chatId] || !wallets[chatId].wallets[walletIndex]) {
            return bot.sendMessage(chatId, "❌ Invalid wallet selection.");
        }
    
        // Set the active wallet index
        wallets[chatId].activeWallet = walletIndex;
        saveWallets();
    
        // Refresh the wallets menu to show the new active wallet
        bot.answerCallbackQuery(query.id, { text: `✅ Wallet W${walletIndex + 1} is now active!` });
        bot.emit("callback_query", { ...query, data: "wallets" }); // Reload wallets menu
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
        try {
            let solanaText = "*Solana Wallets*\n";
            let walletsMenu;
            let solanaWalletButtons = [];
    
            const activeIndex = wallets[chatId].activeWallet || 0;  // Default to first wallet
    
            if (!wallets[chatId] || wallets[chatId].wallets.length === 0) {
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
                for (let i = 0; i < wallets[chatId].wallets.length; i++) {
                    const userWallet = wallets[chatId].wallets[i];
                    const publicKey = userWallet.publicKey;
                    const balance = await checkWallet(publicKey, connection);
    
                    const checkmark = (i === activeIndex) ? "✅" : "";  // Show ✅ for active wallet
                    solanaText += `\`${publicKey}\`\n*Label:* W${i + 1} ${checkmark}\n*Balance:* ${balance.toFixed(4)} SOL\n\n`;
    
                    // Add each wallet button to the array
                    solanaWalletButtons.push({ text: `W${i + 1} ${checkmark}`, callback_data: `set_active_wallet_${i}` });
                }
    
                // Group buttons into rows of 3
                let formattedButtons = [];
                for (let i = 0; i < solanaWalletButtons.length; i += 3) {
                    formattedButtons.push(solanaWalletButtons.slice(i, i + 3));
                }
    
                // Add "Create Wallet" and "Back" buttons at the bottom
                formattedButtons.push([{ text: "➕ Create Solana Wallet", callback_data: "create_wallet" }]);
                formattedButtons.push([{ text: "⬅️ Back to Main", callback_data: "main_menu" }]);
    
                walletsMenu = {
                    reply_markup: {
                        inline_keyboard: formattedButtons
                    }
                };
            }
    
            bot.editMessageText(`${solanaText}💡 To rename or export your Solana wallets, click the button with the wallet's name.`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                ...walletsMenu
            });
    
        } catch (error) {
            bot.sendMessage(chatId, "❌ Error fetching wallets.");
            console.log("❌ Error fetching wallets: " + error.message);
        }
    } else if(data === "create_wallet"){
        let max_Wallets = 10
        if (wallets[chatId].wallets.length >= max_Wallets) {
            return bot.sendMessage(chatId, `🚨 You can only create up to ${max_Wallets} wallets.`);
        }

        const newWallet = Keypair.generate();
        const privateKeyBase58 = bs58.encode(newWallet.secretKey);
        const publicKey = newWallet.publicKey;

        // Assign a label based on the number of existing wallets
        const walletCount = wallets[chatId].wallets.length + 1;
        const walletLabel = `W${walletCount}`;

        // Store the new wallet
        wallets[chatId].wallets.push({ label: walletLabel, privateKeyBase58, publicKey });
        saveWallets();

        bot.sendMessage(chatId, `✅ *New Wallet Created!*\n\n🗝 *Public Key:* \`${publicKey}\`\n📛 *Label:* ${walletLabel}\n🔒 *Private Key:* [Stored Securely]`, { parse_mode: "Markdown" });
    } else if (data === "help") {
        bot.sendMessage(chatId, "❓ How can I help you?");
    } else if (data === "refresh") {
        bot.sendMessage(chatId, "🔄 Refreshing your balance...");
    } else if (data === "main_menu") {

        if (!allowedUsers.includes(chatId)) {
            return bot.sendMessage(chatId, "🚫 Access denied. You are not authorized to use this bot.");
        }
    
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
                        publicKey: newWallet.publicKey
                    }]
                };

                saveWallets();
            }

            // Get the active wallet
            const activeIndex = wallets[chatId].activeWallet || 0;
            const userWallet = wallets[chatId].wallets[activeIndex];
            const publicKey = userWallet.publicKey;
    
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
        // Ensure wallets exist for the user
        if (!wallets[chatId] ||  wallets[chatId].wallets.length === 0) {
            console.log(`Creating a new wallet for user: ${chatId}`);

            const newWallet = Keypair.generate();
            wallets[chatId] = {
                activeWallet: 0,  // Default first wallet as active
                wallets: [{
                    label: "W1",
                    privateKeyBase58: bs58.encode(newWallet.secretKey),
                    publicKey: newWallet.publicKey
                }]
            };

            saveWallets();
        }

        // Get the active wallet
        const activeIndex = wallets[chatId].activeWallet || 0;
        const userWallet = wallets[chatId].wallets[activeIndex];
        const publicKey = userWallet.publicKey;

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