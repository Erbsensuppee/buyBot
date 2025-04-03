const { checkWallet } = require("../checkWallet.js"); 
const { loadWallets } = require("./allWallets");
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');

async function showWalletsMenu(bot, chatId, messageId, connection) {
    try {
        const wallets = loadWallets();
        let solanaText = "*Solana Wallets*\n";
        let walletsMenu;
        let solanaWalletButtons = [];

        const activeIndex = wallets[chatId]?.activeWallet || 0;

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

                // Use stored lamports or fallback to checkWallet
                const lamports = userWallet.solBalanceLamports !== undefined
                    ? userWallet.solBalanceLamports
                    : await checkWallet(publicKey, connection);

                const balanceSol = lamports / LAMPORTS_PER_SOL;
                const checkmark = (i === activeIndex) ? "✅" : "";
                solanaText += `\`${publicKey}\`\n*Label:* W${i + 1} ${checkmark}\n*Balance:* ${balanceSol.toFixed(4)} SOL\n\n`;

                solanaWalletButtons.push({ text: `W${i + 1} ${checkmark}`, callback_data: `set_active_wallet_${i}` });
            }

            const formattedButtons = [];
            for (let i = 0; i < solanaWalletButtons.length; i += 3) {
                formattedButtons.push(solanaWalletButtons.slice(i, i + 3));
            }

            formattedButtons.push([{ text: "➕ Create Solana Wallet", callback_data: "create_wallet" }]);
            formattedButtons.push([{ text: "Export Private Key", callback_data: "export_privateKey" }]);
            formattedButtons.push([
                { text: "⬅️ Back to Main", callback_data: "main_menu" },
                { text: "🔄 Refresh Balances", callback_data: "refresh_balances" }
            ]);

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
        console.log("❌ Error fetching wallets:", error.message);
    }
}

module.exports = { showWalletsMenu };
