const fs = require("fs");
const path = require("path");
const { checkWallet } = require("../checkWallet.js");
const { 
    Connection,
    Keypair, 
    LAMPORTS_PER_SOL,
    VersionedTransaction,
    PublicKey,
    TransactionMessage,
    ComputeBudgetProgram
    } = require('@solana/web3.js');

const WALLET_FILE = path.join(__dirname, "..", "..", "data", "wallets.json");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadWallets() {
    return JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
}

function saveWallets(wallets) {
    fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2));
}

async function increaseSolBalanceForWallet(chatId, walletIndex, lamports) {
    const wallets = loadWallets();
    const wallet = wallets[chatId]?.wallets?.[walletIndex];

    if (!wallet) {
        throw new Error(`Wallet not found for chatId ${chatId}, index ${walletIndex}`);
    }

    wallet.solBalanceLamports = (wallet.solBalanceLamports || 0) + lamports;

    saveWallets(wallets);
    console.log(`💾 Increased balance for [${chatId}] W${walletIndex + 1}: +${lamports} lamports`);
}

async function decreaseSolBalanceForWallet(chatId, walletIndex, lamports) {
    const wallets = loadWallets();
    const wallet = wallets[chatId]?.wallets?.[walletIndex];

    if (!wallet) {
        throw new Error(`Wallet not found for chatId ${chatId}, index ${walletIndex}`);
    }

    wallet.solBalanceLamports = Math.max(0, (wallet.solBalanceLamports || 0) - lamports);

    saveWallets(wallets);
    console.log(`💾 Decreased balance for [${chatId}] W${walletIndex + 1}: -${lamports} lamports`);
}



async function refreshAllBalances(chatId, connection) {
    const wallets = loadWallets();
    const walletList = wallets[chatId]?.wallets || [];

    for (const wallet of walletList) {
        const publicKey = new PublicKey(wallet.publicKey);
        const balance = await connection.getBalance(publicKey);
        wallet.solBalanceLamports = balance;
        await sleep(250); // 💤 throttle to ~4 requests/sec
    }

    saveWallets(wallets);
}

async function refreshAllBalancesGlobal(connection) {
    const wallets = loadWallets();

    for (const chatId of Object.keys(wallets)) {
        const userWallets = wallets[chatId]?.wallets || [];

        for (const wallet of userWallets) {
            const publicKey = new PublicKey(wallet.publicKey);
            const balance = await connection.getBalance(publicKey);
            wallet.solBalanceLamports = balance;
            console.log(`💰 [${chatId}] ${wallet.label} → ${balance / LAMPORTS_PER_SOL} SOL`);
            
            await sleep(250); // 💤 throttle to ~4 requests/sec
        }
    }

    saveWallets(wallets);
}


// Expose the functions
module.exports = {
    saveWallets,
    refreshAllBalances,
    loadWallets,
    refreshAllBalancesGlobal,
    decreaseSolBalanceForWallet,
    increaseSolBalanceForWallet
};
