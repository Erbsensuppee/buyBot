function formatNumber(num) {
    num = Number(num);
    if (isNaN(num)) {
        throw new TypeError("Input must be a valid number");
    }
    const str = num.toExponential(); // Convert to exponential form (e.g., "3.98332e-6")
    const [base, exponent] = str.split("e"); // Split into base and exponent
    const baseParts = base.split(".");
    
    if (baseParts.length < 2) return num.toString(); // If there's no decimal part, return the number as is

    const decimals = baseParts[1]; // Get the decimal part
    const zeroesCount = Math.abs(Number(exponent)) - 1; // Count leading zeroes
    
    // Build the formatted string
    return `0.0(${zeroesCount})${baseParts[0]}${baseParts[1]}`;
}

function calculateMarketCap(decimals, price) {
    const totalSupply = 1;
    const totalSupplyAdjusted = totalSupply * Math.pow(10, decimals); // Adjust total supply for decimals
    const marketCap = totalSupplyAdjusted * price; // Calculate market cap
    return marketCap;
}

function calculateTokens(solanaPrice, tokenPrice, solAmount) {
    if (solanaPrice <= 0 || tokenPrice <= 0 || solAmount <= 0) {
        throw new Error("Solana-Preis, Token-Preis und Solana-Menge müssen größer als 0 sein.");
    }

    const totalUsd = solAmount * solanaPrice; // USD-Wert der eingegebenen Solana
    const tokens = totalUsd / tokenPrice; // Anzahl der Token
    return tokens;
}

module.exports = { 
    formatNumber, 
    calculateMarketCap,
    calculateTokens
};

async function refreshBuyWindow(chatId, messageId) {
    if (!userBuyData[chatId] || !userBuyData[chatId].tokenMint) {
        return bot.sendMessage(chatId, "❌ No token selected. Please enter a token mint first.");
    }

    const tokenMint = userBuyData[chatId].tokenMint;
    const solAmount = userBuyData[chatId].solAmount || 0.5; // Default to 0.5 SOL
    const slippage = userBuyData[chatId].slippage || 5; // Default to 0.5%

    // Fetch token price again
    const response = await axios.get(`https://api.jup.ag/price/v2?ids=${tokenMint},${process.env.SOLANA_ADDRESS}`);
    if (!response.data || !response.data.data[tokenMint]) {
        return bot.sendMessage(chatId, "❌ Token not found on Jupiter. Please try again.");
    }

    // Fetch token informations from Jupiter API
    const response2 = await axios.get(`https://api.jup.ag/tokens/v1/token/${tokenMint}`);

    if (!response2.data || !response2.data.address === tokenMint) {
        return bot.sendMessage(chatId, "❌ Token not found on Jupiter. Please try a different token.");
    }

    const tokenInformations = response2.data;
    const activeIndex = wallets[chatId].activeWallet || 0;
    const tokenData = response.data.data[tokenMint];
    const solanaData = response.data.data[process.env.SOLANA_ADDRESS];
    const price = tokenData.price || 0;
    const publicKey = userWallet.publicKey;
    const balance = await checkWallet(publicKey, connection);

    let tokenSymbol = tokenInformations.symbol;
    let tokenMarcetCap = calculateMarketCap(tokenInformations.decimals, tokenData.price);
    let tokenValue = solAmount * solanaData.price;
    let calculatedTokenAmount = calculateTokens(solanaData.price, tokenData.price, solAmount);
    let message = "";
    // Show swap details
    message += `*Buy $${tokenSymbol.toUpperCase()}* — (${tokenSymbol})\n\`${tokenMint}\`\n\n`;

    message += `Balance: *${balance.toFixed(3)} SOL — W${activeIndex + 1}*\n`
    message += `Price: *$${formatNumber(price)}* — MC: *$${tokenMarcetCap.toFixed(2)}K*\n\n`;

    message += `*${solAmount}* ⇄ *${calculatedTokenAmount.toFixed(0)} ${tokenSymbol.toUpperCase()} ($${tokenValue.toFixed(2)})*\n`;


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