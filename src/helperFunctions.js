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
        return Number(postBalance.uiTokenAmount.amount); // raw amount
      }
  
      return 0;
    } catch (err) {
      console.error("❌ Failed to fetch or parse transaction:", err);
      return 0;
    }
  }

async function storeTokenData(outputMint, filePath, tokenBalance, debugFilePath) {
    let tokens = [];
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }
      
    // Attempt to read the existing tokens file.
    if (fs.existsSync(filePath)) {
      try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        tokens = fileData ? JSON.parse(fileData) : [];
      } catch (error) {
        console.error("Error parsing JSON file. Creating a new one.", error);
        tokens = [];
      }
    }
    const decimals = 6
    const humanReadableBalance = Number(tokenBalance) / Math.pow(10, decimals);
    if (tokenBalance === 0) {
      throw new Error("Token balance is zero, cannot calculate token price.");
    }
    // Calculate the token price (assuming SOLAMOUNT is defined and calculateTokenPrice is available).
    const feeFromSolscan = 0;
    const tokenPrice = (parseFloat(SOLAMOUNT) + feeFromSolscan) / humanReadableBalance;
  
    // Check if the token already exists in the tokens array.
    const tokenIndex = tokens.findIndex(token => token.tokenMint === outputMint);
  
    if (tokenIndex >= 0) {
      // Token exists: update its data.
      tokens[tokenIndex] = {
        tokenMint: outputMint,
        tokenPrice: tokenPrice,
        tokenBalance: tokenBalance,
        updatedAt: new Date().toISOString()  // Record when the token info was updated.
      };
      console.log(`✅ Token data for ${outputMint} updated successfully.`);
    } else {
      // Token does not exist: add it.
      tokens.push({
        tokenMint: outputMint,
        tokenPrice: tokenPrice,
        tokenBalance: tokenBalance,
        createdAt: new Date().toISOString()  // Record creation time.
      });
      console.log("✅ Token data stored successfully.");
    }
  
    // Write the updated tokens array back to the main file.
    try {
      fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), 'utf8');
    } catch (error) {
      console.error("Error writing tokens file:", error);
    }
  
    // ---------- Debug File Update ----------
  
    let debugTokens = [];
  
    // Attempt to read the debug tokens file.
    if (fs.existsSync(debugFilePath)) {
      try {
        const debugData = fs.readFileSync(debugFilePath, 'utf8');
        debugTokens = debugData ? JSON.parse(debugData) : [];
      } catch (error) {
        console.error("Error parsing debug JSON file. Creating a new one.", error);
        debugTokens = [];
      }
    }
  
    // Create a human-readable timestamp using the Austrian locale.
    const timestamp = new Date().toLocaleString('de-AT');
  
    // Prepare the debug record.
    const debugRecord = {
      tokenMint: outputMint,
      tokenPrice: tokenPrice,
      tokenBalance: tokenBalance,
      timestamp: timestamp,
    };
  
    // Append the debug record and write it back to the debug file.
    debugTokens.push(debugRecord);
    try {
      fs.writeFileSync(debugFilePath, JSON.stringify(debugTokens, null, 2), 'utf8');
      console.log("✅ Debug token data stored successfully in debug file.");
    } catch (error) {
      console.error("Error writing debug tokens file:", error);
    }
  }

module.exports = { 
    formatNumber, 
    calculateMarketCap,
    calculateTokens,
    calculateSolana,
    getTokenBalanceFromTransaction,
    storeTokenData
};
