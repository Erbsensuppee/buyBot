const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const { getOrCreateAssociatedTokenAccount,closeAccount, getAssociatedTokenAddress, createAssociatedTokenAccount, transfer, wrap , createCloseAccountInstruction} = require("@solana/spl-token");
const dotenv = require('dotenv');
const bs58 = require('bs58');


// === CONFIG ===
dotenv.config();
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com"; // Use Mainnet RPC
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

// Replace this with your **fee wallet address**
const feeWalletAddress = "5KMcyGvqwd95wgFiK6Q9rSA5w9sBrDcUE1bP6cNt9Qqj";


// Wrapped SOL (wSOL) Mint Address
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const tokenAccountPubkey = new PublicKey("2XcBU91etyeUAcrkvpY4H3HDPRnaC9eVfCpfsrgjf4YV");


async function closeWSOLAccount() {
    try {
        const secretKeyBase58 = process.env.PRIVATE_KEY;

        // Decode the Base58 string into a Uint8Array
        const secretKeyUint8Array = bs58.decode(secretKeyBase58);

        // Create a Keypair from the decoded secret key
        const wallet = Keypair.fromSecretKey(secretKeyUint8Array);

        console.log("Wallet public key:", wallet.publicKey.toBase58());
        
        const feeWalletPubkey = new PublicKey(wallet.publicKey.toBase58());
        
        // let tx = new Transaction().add(
        //     createCloseAccountInstruction(
        //       tokenAccountPubkey, // token account which you want to close
        //       wallet.publicKey, // destination
        //       wallet, // owner of token account
        //     ),
        //   );
        //   console.log(
        //     `txhash: ${await sendAndConfirmTransaction(connection, tx, [
        //         wallet,
        //         wallet.publicKey /* fee payer + owner */,
        //     ])}`,
        //   );
        let txhash = await closeAccount(
            connection, // connection
            wallet, // payer
            tokenAccountPubkey, // token account which you want to close
            wallet.publicKey, // destination
            wallet, // owner of token account
          );
          console.log(`txhash: ${txhash}`);

    } catch (error) {
        console.error("❌ Error setting up wSOL account:", error);
    }
}

// Run the function
closeWSOLAccount();
