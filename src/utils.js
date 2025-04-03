const {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  AddressLookupTableAccount,
  Connection,
} = require("@solana/web3.js");

async function getAddressLookupTableAccounts(keys, connection) {
    const addressLookupTableAccounts = await Promise.all(
      keys.map(async (key) => {
        const accountInfo = await connection.getAccountInfo(new PublicKey(key));
        return {
          key: new PublicKey(key),
          state: accountInfo
            ? AddressLookupTableAccount.deserialize(accountInfo.data)
            : null,
        };
      })
    );
    return addressLookupTableAccounts.filter((account) => account.state !== null);
  }

async function simulateTransaction(
    instructions,
    payer,
    addressLookupTableAccounts,
    maxRetries = 5,
    connection
  ) {
    console.log("🔍 Simulating transaction to estimate compute units...");
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  
    let retries = 0;
    while (retries < maxRetries) {
      try {
        const messageV0 = new TransactionMessage({
          payerKey: payer,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: instructions.filter(Boolean),
        }).compileToV0Message(addressLookupTableAccounts);
  
        const transaction = new VersionedTransaction(messageV0);
  
        const simulation = await connection.simulateTransaction(transaction, {
          sigVerify: false,
          replaceRecentBlockhash: true,
        });
  
        if (simulation.value.err) {
          console.error(
            "❌ Simulation error:",
            JSON.stringify(simulation.value.err, null, 2)
          );
          if (simulation.value.logs) {
            console.error("📜 Simulation logs:", simulation.value.logs);
          }
          throw new Error(
            `❌ Simulation failed: ${JSON.stringify(simulation.value.err)}`
          );
        }
  
        const unitsConsumed = simulation.value.unitsConsumed || 0;
        console.log("✅ Simulation successful. Units consumed:", unitsConsumed);
  
        const computeUnits = Math.ceil(unitsConsumed * 1.2);
        return computeUnits;
      } catch (error) {
        console.error("❌ Error during simulation:", error.message);
        if (error.message.includes("InsufficientFundsForRent")) {
          return { error: "InsufficientFundsForRent" };
        }
        retries++;
        if (retries >= maxRetries) {
          console.error("❌ Max retries reached. Simulation failed.");
          return undefined;
        }
        console.log(`🔄 Retrying simulation (attempt ${retries + 1})...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async function getAveragePriorityFee(connection) {
    const priorityFees = await connection.getRecentPrioritizationFees();
    if (priorityFees.length === 0) {
      return { microLamports: 10000, solAmount: 0.00001 }; // Default to 10000 micro-lamports if no data
    }
  
    const recentFees = priorityFees.slice(-150); // Get fees from last 150 slots
    const averageFee =
      recentFees.reduce((sum, fee) => sum + fee.prioritizationFee, 0) /
      recentFees.length;
    const microLamports = Math.ceil(averageFee);
    const solAmount = microLamports / 1e6 / 1e3; // Convert micro-lamports to SOL
    return { microLamports, solAmount };
  }

function createVersionedTransaction(
    instructions,
    payer,
    addressLookupTableAccounts,
    recentBlockhash,
    computeUnits,
    priorityFee
  ) {
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits,
    });
    const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFee.microLamports,
    });
  
    const finalInstructions = [computeBudgetIx, priorityFeeIx, ...instructions];
  
    const messageV0 = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: recentBlockhash,
      instructions: finalInstructions,
    }).compileToV0Message(addressLookupTableAccounts);
  
    return new VersionedTransaction(messageV0);
  }

  function deserializeInstruction(instruction) {
    return {
      programId: new PublicKey(instruction.programId),
      keys: instruction.accounts.map((key) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: Buffer.from(instruction.data, "base64"),
    };
  }

module.exports = { getAddressLookupTableAccounts, simulateTransaction, getAveragePriorityFee, createVersionedTransaction, deserializeInstruction};