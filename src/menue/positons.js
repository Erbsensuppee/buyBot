const { getUserTokens } = require("../helperFunctions.js")
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');


async function showPositionMenu(bot, chatId, userWalletData) {
    try {
        const activeIndex = userWalletData.activeWallet || 0;
        const userWallet = userWalletData.wallets[activeIndex];
        const publicKey = userWallet.publicKey;

        const tokens = await getUserTokens(chatId);

        if (tokens.length === 0) {
            return bot.sendMessage(chatId, "❌ No tokens found in your positions.");
        }
        const balanceLamports = userWallet.solBalanceLamports || 0;
        const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
        
        let message = `🪙 *Your Open Positions* (${tokens.length}/${tokens.length})\n`;
        message += `💰 *Balance:* ${balanceSol.toFixed(4)} SOL\n\n`;

        let totalValue = 0;

        tokens.forEach((token, i) => {
            message += `\n${i + 1}. ${token.symbol} - ${token.amount} SOL`;
            if (token.valueUsd) {
                message += ` ($${token.valueUsd.toFixed(2)})`;
            }
            totalValue += token.valueUsd || 0;
        });

        message += `\n\n📈 *Estimated Value:* $${totalValue.toFixed(2)}`;

        const buttons = tokens.map(token => [
            { text: token.symbol, callback_data: `sell_${token.tokenMint}` }
        ]);

        buttons.push([{ text: "⬅️ Back", callback_data: "main_menu" }]);

        bot.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: buttons
            }
        });

    } catch (err) {
        console.error("❌ Error in showPositionMenu:", err);
        bot.sendMessage(chatId, "⚠️ Failed to load your positions.");
    }
}

module.exports = { 
    showPositionMenu
};