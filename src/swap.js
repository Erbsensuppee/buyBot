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
    storeTokenData
 } = require("./helperFunctions.js")

async function performOptimizedSwapBuy(inputMint, solAmount, outputMint, connection, adjustedSlippage, privateKey, chatId){
    const adjustedAmount = Math.floor(solAmount * LAMPORTS_PER_SOL); // Convert to lamports
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    const publicKey = keypair.publicKey;
    try {
        // 1. Get quote from Jupiter
        console.log("💰 Getting quote from Jupiter...");

        const quoteResponse = await getBuyQuote(inputMint, outputMint, adjustedAmount, adjustedSlippage);

        console.log("🔄 Quote received. Fetching swap instructions...");

        // 2. Get swap instructions
        const swapInstructions = await getBuySwapInstructions(quoteResponse, publicKey.toString());

        if (!swapInstructions || swapInstructions.error) {
            console.warn("❌ Failed to get swap instructions. Retrying...");
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
        const latestBlockhash = await connection.getLatestBlockhash("confirmed");

        // 4. Simulate transaction to get compute units
        const instructions = [
            ...setupInstructions.map(deserializeInstruction),
            swapInstruction,
        ];
        if (cleanupInstruction) {
            instructions.push(deserializeInstruction(cleanupInstruction));
        }

        // 5. Fetch priority fee
        const priorityFee = await getAveragePriorityFee(connection);

        // 6. Create versioned transaction
        const transaction = createVersionedTransaction(
            instructions,
            keypair.publicKey,
            addressLookupTableAccounts,
            latestBlockhash.blockhash,
            computeUnits,
            priorityFee
        );

        console.log("✍️ Signing transaction...");
        // 7. Sign the transaction
        transaction.sign([keypair]);

        // 8. serialize transaction
        const transactionBinary = transaction.serialize();

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
            if (err.name === "TransactionExpiredTimeoutError" || err.message.includes("Transaction was not confirmed")) {
            console.warn(`⚠️ Confirmation timeout for ${outputMint}. Retrying up to 5 times...`);
    
            let retryCount = 0;
            while (retryCount < 5) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                try {
                confirmation = await connection.confirmTransaction(signature, "confirmed");
                if (confirmation && confirmation.value && !confirmation.value.err) {
                    console.log(`✅ Transaction confirmed after retry #${retryCount + 1}: https://solscan.io/tx/${signature}`);
                    console.info(`✅ Transaction confirmed after retry #${retryCount + 1}: https://solscan.io/tx/${signature}`);
                    break;
                }
                } catch (e) {
                console.warn(`⏳ Retry #${retryCount + 1} failed...`);
                }
                retryCount++;
            }
    
            if (!confirmation || confirmation.value.err) {
                console.error(`❌ Transaction for ${outputMint} failed after 5 confirmation retries.`);
                throw new Error("Final confirmation failed.");
            }
            } else {
            throw err;
            }
        }
        try {
            //await storeAmmTokenData(outputMint, filePath, priceInSol);
            const filePath = `./data/${chatId}.json`; // main token data
            const debugFilePath = `./data/${chatId}_debug.json`; // user-specific debug file
            const tokenBalance = await getTokenBalanceFromTransaction(connection, keypair.publicKey, outputMint, signature);
            const tokensStored = await storeTokenData(outputMint, filePath, tokenBalance, debugFilePath);
            } catch (e) {
            console.warn("⚠️ Failed to store token data:", e);
            }
    } catch (error) {
        console.error(`❌ Error in attempt ${retries + 1}:`, error);
        retries++;
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
    }    
} 
async function performOptimizedSwapSell(inputMint, outputMint, connection){
const keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
const publicKey = keypair.publicKey;

const sellAmount = await getTokenBalanceFromFile(inputMint, filePath);

const adjustedAmount = sellAmount;
const adjustedSlippage = SELL_SLIPPAGE * 100;
try {
    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            // 1. Get quote from Jupiter
            console.log("💰 Getting quote from Jupiter...");
            const quoteResponse = await getQuote(inputMint, outputMint, adjustedAmount, adjustedSlippage);

            if (!quoteResponse || !quoteResponse.routePlan) {
                console.warn("❌ No quote received or route plan missing. Retrying...");
                retries++;
                await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
                continue;
            }

            console.log("🔄 Quote received. Fetching swap instructions...");

            // 2. Get swap instructions
            const swapInstructions = await getSwapInstructions(quoteResponse, publicKey.toString());

            if (!swapInstructions || swapInstructions.error) {
                console.warn("❌ Failed to get swap instructions. Retrying...");
                retries++;
                await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
                continue;
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
            const latestBlockhash = await connection.getLatestBlockhash("confirmed");

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
                console.warn("❌ Compute units undefined. Retrying...");
                retries++;
                await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
                continue;
            } else if (computeUnits.error === "InsufficientFundsForRent") {
                console.log("❌ Insufficient funds for rent. Skipping this swap.");
                return; // Not retryable, exit loop
            }

            console.log(`✅ *Simulation Successful!*\n\n🔹 Proceeding with swap execution.`);

            // 5. Fetch priority fee
            const priorityFee = await getAveragePriorityFee(connection);

            // 6. Create versioned transaction
            const transaction = createVersionedTransaction(
                instructions,
                keypair.publicKey,
                addressLookupTableAccounts,
                latestBlockhash.blockhash,
                computeUnits,
                priorityFee
            );

            console.log("✍️ Signing transaction...");
            // 7. Sign the transaction
            transaction.sign([keypair]);

            // 8. serialize transaction
            const transactionBinary = transaction.serialize();

            // 9 send transaction
            const signature = await connection.sendRawTransaction(transactionBinary, {
                maxRetries: 2,
                skipPreflight: true
            });

            console.log(`✅ Transaction sent.`);

            // 10. confirm transaction
            const confirmation = await connection.confirmTransaction({signature,}, "finalized");

            if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
            } else{
            // Post-sell operations
            console.log(`Transaction successful: https://solscan.io/tx/${signature}/`);
            let walletBalance = await getSolBalance(publicKey, connection);
            let message = `🤖 *Coin Sell Notification*\n\n`;
            message += `🔹 *Coin:* ${inputMint}\n`;
            message += `🔗 *TXID:* [View Transaction](https://solscan.io/tx/${signature})\n\n`;
            message += `🔑 Wallet Balance: \`${walletBalance}\` SOL\n`;
            message += `✅ *Sell successful!*\n`;
            await sendTelegramMessage(message, TELEGRAM_API_TOKEN, TELEGRAM_CHAT_ID);
            await removeTokenFromFile(filePath, inputMint);
            return;
            }
        } catch (error) {
            console.error(`❌ Error in attempt ${retries + 1}:`, error);
            retries++;
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
        }
    }

    if (retries === maxRetries) {
        console.error("❌ Maximum retries reached. Swap process failed.");
        throw new Error("Swap process failed after maximum retries");
    }
} catch (error) {
    console.error("❌ Swap Error:", error);
    throw error;
}

}
  module.exports = { performSwapBuy, performSwapSell}