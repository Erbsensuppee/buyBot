const { 
    Connection,
    Keypair, 
    LAMPORTS_PER_SOL,
    VersionedTransaction,
    PublicKey,
    TransactionMessage,
    ComputeBudgetProgram
    } = require('@solana/web3.js');
const { getBuyQuote, 
    getSellQuote,
    getBuySwapInstructions,
    getSellSwapInstructions } = require('./jupiterApi.js')
const { getAddressLookupTableAccounts, 
    simulateTransaction, 
    getAveragePriorityFee, 
    createVersionedTransaction, 
    deserializeInstruction } = require("./utils.js")
const {getTokenBalanceFromTransaction,
    storeTokenData,
    updateTokenData
 } = require("./helperFunctions.js")
 const bs58 = require('bs58');

async function performSwapBuy(inputMint, solAmount, outputMint, connection, adjustedSlippage, privateKey, chatId){
    const adjustedAmount = Math.floor(solAmount * LAMPORTS_PER_SOL); // Convert to lamports
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const publicKey = keypair.publicKey;
    try {
        // 1. Get quote from Jupiter
        console.log("💰 Getting quote from Jupiter...");

        const quoteResponse = await getBuyQuote(inputMint, outputMint, adjustedAmount, adjustedSlippage);

        console.log("🔄 Quote received. Fetching swap instructions...");

        // 2. Get swap instructions
        const swapInstructions = await getBuySwapInstructions(quoteResponse, publicKey.toString(), adjustedSlippage);

        console.log("📜 Swap instructions received. Preparing transaction...");
  
        // 3. Prepare Transaction
        const transactionBase64 = swapInstructions.swapTransaction
        const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));

        console.log("✍️ Signing transaction...");
        // 7. Sign the transaction
        transaction.sign([keypair]);

        // 8. serialize transaction
        const rawTx = transaction.serialize();

        // 9 send 
        let signature = await connection.sendRawTransaction(rawTx, {
                skipPreflight: true,
                preflightCommitment: "confirmed",
                maxRetries: 1,
                });
                    
        console.log(`✅ Transaction sent.`);

        // 10. confirm transaction
        try {
            confirmation = await connection.confirmTransaction(signature, "confirmed");
            console.info("🚀 Sending confirmTransaction...")
        } catch (err) {    
            if (!confirmation || confirmation.value.err) {
                console.error(`❌ Transaction for ${outputMint} failed after 5 confirmation retries.`);
                throw new Error("Final confirmation failed.");
            }
        }
        console.log(`🎉 Transaction successful: https://solscan.io/tx/${signature}/`);
        return signature;
    } catch (error) {
        console.error(`❌ Error in attempt:`, error);
    }    
} 
async function performSwapSell(inputMint, tokenAmount, outputMint, connection, adjustedSlippage, privateKey, chatId){
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const publicKey = keypair.publicKey;

    try {
        // 1. Get quote from Jupiter
        console.log("💰 Getting quote from Jupiter...");

        const quoteResponse = await getSellQuote(inputMint, outputMint, tokenAmount, adjustedSlippage);

        console.log("🔄 Quote received. Fetching swap instructions...");

        // 2. Get swap instructions
        const swapInstructions = await getSellSwapInstructions(quoteResponse, publicKey.toString());

        console.log("📜 Swap instructions received. Preparing transaction...");

        // 3. Prepare Transaction
        const transactionBase64 = swapInstructions.swapTransaction
        const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));


        console.log("✍️ Signing transaction...");
        // 7. Sign the transaction
        transaction.sign([keypair]);

        // 8. serialize transaction
        const rawTx = transaction.serialize();

        // 9 send 
        let signature = await connection.sendRawTransaction(rawTx, {
                skipPreflight: true,
                preflightCommitment: "confirmed",
                maxRetries: 1,
                });
                    
        console.log(`✅ Transaction sent.`);

        // 10. confirm transaction
        try {
            confirmation = await connection.confirmTransaction(signature, "confirmed");
            console.info("🚀 Sending confirmTransaction...")
        } catch (err) {    
            if (!confirmation || confirmation.value.err) {
                throw new Error("Final confirmation failed.");
            }
        }
        return signature;
    } catch (error) {
        console.error(`❌ Error in attempt:`, error);
    } 
}
  module.exports = { performSwapBuy, performSwapSell}