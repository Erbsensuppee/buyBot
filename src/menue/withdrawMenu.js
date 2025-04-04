const { getUserTokens } = require("../helperFunctions.js")
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
const { saveWallets, loadWallets } = require("../wallets/allWallets.js")

const showWithdrawMenu = async (bot, chatId, messageId = null, withdrawData = {}) => {
    try {
        const wallets = loadWallets();
        const activeIndex = wallets[chatId]?.activeWallet || 0;
        const userWallet = wallets[chatId]?.wallets[activeIndex];

        if (!userWallet) {
            return bot.sendMessage(chatId, "🚨 No active wallet found. Please create or select one first.");
        }

        const balanceLamports = userWallet.solBalanceLamports || 0;
        const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

        const selectedPercentage = withdrawData.selectedPercentage || null;
        const destinationAddress = withdrawData.destinationAddress || null;
        const customAmountSol = withdrawData.customAmountSol || null;

        let selectedText = "";
        let amountToWithdraw = null;

        if (customAmountSol) {
            selectedText = `🧮 *Selected:* ${customAmountSol} SOL`;
            amountToWithdraw = parseFloat(customAmountSol);
        } else if (selectedPercentage) {
            amountToWithdraw = (balanceSol * selectedPercentage / 100);
            selectedText = `🧮 *Selected:* ${selectedPercentage}% = *${amountToWithdraw.toFixed(4)} SOL*`;
        }

        let message = `💸 *Withdraw SOL*\n\n💰 *Balance:* ${balanceSol.toFixed(4)} SOL — ${userWallet.label || `W${activeIndex + 1}`}\n`;

        if (selectedText) {
            message += `\n${selectedText}`;
        }

        if (destinationAddress) {
            message += `\n📬 *To:* \`${destinationAddress}\``;
        }

        message += `\n\nChoose withdrawal settings:`;

        const keyboard = [
            [
                { text: "⬅️ Back", callback_data: "main_menu" },
                { text: "🔄 Refresh", callback_data: "withdraw" }
            ],
            [
                { text: `${selectedPercentage === 50 && !customAmountSol ? "✅ " : ""}50 %`, callback_data: "withdraw_50" },
                { text: `${selectedPercentage === 100 && !customAmountSol ? "✅ " : ""}100 %`, callback_data: "withdraw_100" }
            ],
            [
                { text: `${customAmountSol ? "✅ " : ""}✏️ X SOL`, callback_data: "custom_withdraw_amount" }
            ],
            [
                { text: "🏦 Set Withdrawal Address", callback_data: "set_withdrawal_address" }
            ]
        ];

        if (amountToWithdraw && destinationAddress) {
            keyboard.push([{ text: "✅ Confirm Withdrawal", callback_data: "confirm_withdrawal" }]);
        }

        const withdrawMenu = {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: "Markdown"
        };

        if (messageId) {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                ...withdrawMenu
            });
        } else {
            await bot.sendMessage(chatId, message, withdrawMenu);
        }

    } catch (error) {
        console.error("❌ Error in showWithdrawMenu:", error.message);
        await bot.sendMessage(chatId, "❌ Failed to open the Withdraw menu.");
    }
};



module.exports = { showWithdrawMenu }