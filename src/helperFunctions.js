const { 
  Connection,
  Keypair, 
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  PublicKey,
  TransactionMessage,
  ComputeBudgetProgram
  } = require('@solana/web3.js');
const fs = require('fs');

const path = require('path');

function formatNumber(num) {
    num = Number(num);
    if (isNaN(num)) {
        throw new TypeError("Input must be a valid number");
    }
    const str = num.toExponential(); // Convert to exponential form (e.g., "3.98332e-6")
    const [base, exponent] = str.split("e"); // Split into base and exponent
    const baseParts = base.split(".");
    
    if (baseParts.length < 2) return num.toString(); // If there's no decimal part, return the number as is

    const decimals = baseParts[1]; // Get the decimal part
    const zeroesCount = Math.abs(Number(exponent)) - 1; // Count leading zeroes
    
    // Build the formatted string
    return `0.0(${zeroesCount})${baseParts[0]}${baseParts[1]}`;
}

function calculateMarketCap(decimals, price) {
    const totalSupply = 1;
    const totalSupplyAdjusted = totalSupply * Math.pow(10, decimals); // Adjust total supply for decimals
    const marketCap = totalSupplyAdjusted * price; // Calculate market cap
    return marketCap;
}

function calculateTokens(solanaPrice, tokenPrice, solAmount) {
    if (solanaPrice <= 0 || tokenPrice <= 0 || solAmount <= 0) {
        throw new Error("Solana-Preis, Token-Preis und Solana-Menge müssen größer als 0 sein.");
    }

    const totalUsd = solAmount * solanaPrice; // USD-Wert der eingegebenen Solana
    const tokens = totalUsd / tokenPrice; // Anzahl der Token
    return tokens;
}

function calculateSolana(solanaPrice, tokenPrice, tokenAmount) {
    if (solanaPrice <= 0 || tokenPrice <= 0 || tokenAmount <= 0) {
        throw new Error("Solana-Preis, Token-Preis und Token-Menge müssen größer als 0 sein.");
    }

    const totalUsd = tokenAmount * tokenPrice; // USD-Wert der eingegebenen Token
    const solana = totalUsd / solanaPrice; // Anzahl der Solana
    return solana;
}

/**
 * Retrieve the raw token balance (in smallest units) for a specific token in a wallet,
 * directly from a parsed transaction using postTokenBalances.
 *
 * @param {Connection} connection - The Solana connection object.
 * @param {string | PublicKey} walletAddress - The wallet's public key.
 * @param {string | PublicKey} tokenMint - The token mint address.
 * @param {string} txid - The transaction signature to scan.
 * @returns {Promise<number>} - The token balance in raw units after the transaction.
 */
async function getTokenBalanceFromTransaction(connection, walletAddress, tokenMint, txid) {
  const wallet = typeof walletAddress === "string" ? new PublicKey(walletAddress) : walletAddress;
  const mint = typeof tokenMint === "string" ? new PublicKey(tokenMint) : tokenMint;

  try {
    const parsedTx = await connection.getParsedTransaction(txid, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    });

    const postBalance = parsedTx?.meta?.postTokenBalances?.find(
      (entry) =>
        entry.owner === wallet.toBase58() &&
        entry.mint === mint.toBase58()
    );

    if (postBalance && postBalance.uiTokenAmount) {
      const amount = Number(postBalance.uiTokenAmount.amount); // raw amount
      return amount;
    }

    return 0;
  } catch (err) {
    console.error("❌ Failed to fetch or parse transaction:", err);
    return 0;
  }
}

async function getBuyTransactionDetails(connection, walletAddress, tokenMint, txid) {
  const wallet = typeof walletAddress === "string" ? new PublicKey(walletAddress) : walletAddress;
  const mint = typeof tokenMint === "string" ? new PublicKey(tokenMint) : tokenMint;

  try {
      const parsedTx = await connection.getParsedTransaction(txid, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
      });

      const postBalance = parsedTx?.meta?.postTokenBalances?.find(
          (entry) =>
              entry.owner === wallet.toBase58() &&
              entry.mint === mint.toBase58()
      );

      const preSol = parsedTx?.meta?.preBalances?.[0] || 0;
      const postSol = parsedTx?.meta?.postBalances?.[0] || 0;
      const solSpentLamports = Math.max(0, preSol - postSol);

      const amount = postBalance?.uiTokenAmount?.amount
          ? Number(postBalance.uiTokenAmount.amount)
          : 0;

      return { tokenAmount: amount, solSpentLamports };
  } catch (err) {
      console.error("❌ Failed to fetch or parse buy transaction:", err);
      return { tokenAmount: 0, solSpentLamports: 0 };
  }
}

async function getSellTransactionDetails(connection, walletAddress, tokenMint, txid) {
  const wallet = typeof walletAddress === "string" ? new PublicKey(walletAddress) : walletAddress;
  const mint = typeof tokenMint === "string" ? new PublicKey(tokenMint) : tokenMint;

  try {
      const parsedTx = await connection.getParsedTransaction(txid, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
      });

      const accountKeys = parsedTx?.transaction?.message?.accountKeys || [];
      const userIndex = accountKeys.findIndex(
          (key) => key.pubkey?.toBase58?.() === wallet.toBase58()
      );

      const preSol = parsedTx?.meta?.preBalances?.[userIndex] || 0;
      const postSol = parsedTx?.meta?.postBalances?.[userIndex] || 0;
      const solReceivedLamports = Math.max(0, postSol - preSol);

      const postBalance = parsedTx?.meta?.postTokenBalances?.find(
          (entry) =>
              entry.owner === wallet.toBase58() &&
              entry.mint === mint.toBase58()
      );

      const newTokenBalance = postBalance?.uiTokenAmount?.amount
          ? Number(postBalance.uiTokenAmount.amount)
          : 0;

      return { solReceivedLamports, newTokenBalance };
  } catch (err) {
      console.error("❌ Failed to fetch or parse sell transaction:", err);
      return { solReceivedLamports: 0, newTokenBalance: 0 };
  }
}

// Optional: dummy fallback symbol resolver (you could replace this with a real token list)
async function resolveSymbol(mint) {
  const knownTokens = {
    'So11111111111111111111111111111111111111112': 'SOL',
    // add more known mints here
  };

  return knownTokens[mint] || 'UNKNOWN';
}


async function getUserTokens(chatId) {
  const filePath = path.join(__dirname, '..', 'data', `${chatId}.json`);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const tokens = JSON.parse(fileContent);

    return tokens;
  } catch (err) {
    console.error(`❌ Failed to read tokens for user ${chatId}:`, err);
    return [];
  }
}


async function storeTokenData(outputMint, filePath, tokenBalance, debugFilePath, SOLAMOUNT, symbol) {
  let tokens = [];

  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }

  // Read the existing token file
  if (fs.existsSync(filePath)) {
    try {
      const fileData = fs.readFileSync(filePath, 'utf8');
      tokens = fileData ? JSON.parse(fileData) : [];
    } catch (error) {
      console.error("Error parsing JSON file. Creating a new one.", error);
      tokens = [];
    }
  }

  const decimals = 6;
  const humanReadableBalance = Number(tokenBalance) / Math.pow(10, decimals);

  if (tokenBalance === 0) {
    throw new Error("Token balance is zero, cannot calculate token price.");
  }

  const feeFromSolscan = 0;
  const tokenPrice = (parseFloat(SOLAMOUNT) + feeFromSolscan) / humanReadableBalance;

  // Check if token already exists
  const tokenIndex = tokens.findIndex(token => token.tokenMint === outputMint);

  if (tokenIndex >= 0) {
    // Update existing token
    tokens[tokenIndex] = {
      ...tokens[tokenIndex], // Keep createdAt and other fields
      tokenPrice,
      tokenBalance,
      symbol,
      updatedAt: new Date().toISOString()
    };
    console.log(`✅ Token data for ${outputMint} updated successfully.`);
  } else {
    // Add new token
    tokens.push({
      tokenMint: outputMint,
      tokenPrice,
      tokenBalance,
      symbol,
      createdAt: new Date().toISOString()
    });
    console.log("✅ Token data stored successfully.");
  }

  // Save to main token file
  try {
    fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (error) {
    console.error("Error writing tokens file:", error);
  }

  // ---------- Debug File Update ----------
  let debugTokens = [];

  if (fs.existsSync(debugFilePath)) {
    try {
      const debugData = fs.readFileSync(debugFilePath, 'utf8');
      debugTokens = debugData ? JSON.parse(debugData) : [];
    } catch (error) {
      console.error("Error parsing debug JSON file. Creating a new one.", error);
      debugTokens = [];
    }
  }

  const timestamp = new Date().toLocaleString('de-AT');

  const debugRecord = {
    tokenMint: outputMint,
    tokenPrice,
    tokenBalance,
    symbol,
    timestamp
  };

  debugTokens.push(debugRecord);

  try {
    fs.writeFileSync(debugFilePath, JSON.stringify(debugTokens, null, 2), 'utf8');
    console.log("✅ Debug token data stored successfully in debug file.");
  } catch (error) {
    console.error("Error writing debug tokens file:", error);
  }
}


  async function updateTokenData(outputMint, filePath, newTokenBalance) {
    let tokens = [];
  
    // Ensure ./data exists
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data');
    }
  
    // Load existing tokens
    if (fs.existsSync(filePath)) {
      try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        tokens = fileData ? JSON.parse(fileData) : [];
      } catch (error) {
        console.error("❌ Error reading/parsing token file:", error);
        return;
      }
    }
  
    const tokenIndex = tokens.findIndex(token => token.tokenMint === outputMint);
  
    if (tokenIndex === -1) {
      console.log(`⚠️ Token ${outputMint} not found in file. Nothing to update.`);
      return;
    }
  
    if (newTokenBalance === 0) {
      // Remove token
      tokens.splice(tokenIndex, 1);
      console.log(`🗑️ Token ${outputMint} removed from ${filePath}`);
    } else {
      // Update token balance
      tokens[tokenIndex].tokenBalance = newTokenBalance;
      tokens[tokenIndex].updatedAt = new Date().toISOString();
      console.log(`✅ Token ${outputMint} balance updated to ${newTokenBalance}`);
    }
  
    // Write back the updated token list
    try {
      fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf8');
    } catch (error) {
      console.error("❌ Error writing token file:", error);
    }
  }
  
module.exports = { 
    formatNumber, 
    calculateMarketCap,
    calculateTokens,
    calculateSolana,
    getTokenBalanceFromTransaction,
    storeTokenData,
    updateTokenData,
    getUserTokens,
    getSellTransactionDetails,
    getBuyTransactionDetails
};
