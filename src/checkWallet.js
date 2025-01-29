const { LAMPORTS_PER_SOL } = require("@solana/web3.js");

async function checkWallet(publicKey, connection) {
    try {
        const balanceLamports = await connection.getBalance(publicKey);
        return balanceLamports / LAMPORTS_PER_SOL; // Convert lamports to SOL
    } catch (error) {
        console.error("Error checking wallet balance:", error);
        return 0; // Return 0 if an error occurs
    }
}

module.exports = { checkWallet };
