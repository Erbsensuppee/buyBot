const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress, createAssociatedTokenAccount, transfer, wrap , createCloseAccountInstruction} = require("@solana/spl-token");

// === CONFIG ===
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com"; // Use Mainnet RPC
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

// Replace this with your **fee wallet address**
const feeWalletAddress = "5KMcyGvqwd95wgFiK6Q9rSA5w9sBrDcUE1bP6cNt9Qqj";

// Wrapped SOL (wSOL) Mint Address
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

async function setupWSOLAccount() {
    try {
        const feeWalletPubkey = new PublicKey(feeWalletAddress);

        // Step 1: Get ATA (Associated Token Account) Address for wSOL
        const ataAddress = await getAssociatedTokenAddress(WSOL_MINT, feeWalletPubkey);
        console.log(`🔹 Associated Token Account for wSOL: ${ataAddress.toBase58()}`);

        // Step 2: Check if the ATA Exists, Otherwise Create It
        const ataAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            Keypair.generate(), // Temporary keypair for creating the account
            WSOL_MINT,
            feeWalletPubkey
        );
        console.log(`✅ Token Account Created or Already Exists: ${ataAccount.address.toBase58()}`);

        // Step 3: Check if the ATA has balance, Otherwise Fund It
        const balance = await connection.getTokenAccountBalance(ataAccount.address);
        if (balance.value.uiAmount === 0) {
            console.log("💰 Funding wSOL Account with 0.01 SOL...");
            const transferSignature = await transfer(
                connection,
                Keypair.generate(), // Temporary keypair to sign the transaction
                new PublicKey(feeWalletAddress),
                ataAccount.address,
                Keypair.generate(), // Replace this with a valid signer for real transfers
                0.01 * 10 ** 9 // Convert SOL to Lamports
            );
            console.log(`✅ Successfully Funded: ${transferSignature}`);
        } else {
            console.log("✅ wSOL Account Already Funded.");
        }

    } catch (error) {
        console.error("❌ Error setting up wSOL account:", error);
    }
}

// Run the function
setupWSOLAccount();
