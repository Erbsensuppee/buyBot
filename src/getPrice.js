const axios = require("axios");

const JUPITER_V6_API_PUMP = "https://quote-api.jup.ag/v6";
const JUPITER_V6_API = "https://api.jup.ag/swap/v1"
const JUPITER_V1_QUOTE = "https://api.jup.ag/swap/v1/quote"
const JUPITER_V2_PRICE = "https://api.jup.ag/price/v2"

async function getPricesInSolBatches(tokenMints) {
    const solMint = "So11111111111111111111111111111111111111112";
    const batchSize = 100;
    const results = {};
  
    // Remove duplicate tokens if any.
    const uniqueTokens = Array.from(new Set(tokenMints));
  
    for (let i = 0; i < uniqueTokens.length; i += batchSize) {
      // Build the API URL by joining tokens and appending SOL's mint address.
      const url = `${JUPITER_V2_PRICE}?ids=${tokenMints},${solMint}&showExtraInfo=true`;
  
      try {
        const response = await axios.get(url);
        const data = response.data.data;
        // Process each token in the batch.
        for (const token of batch) {
          if (token === solMint) {
            results[token] = 1;
          } else {
            const tokenData = data[token];
            if (tokenData && tokenData.price) {
              results[token] = Number(tokenData.price);
            } else {
              console.error(`Price not found for token ${token}`);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching batch prices:", error);
        throw error;
      }
    }
    return results;
  }

const price = getPricesInSolBatches("33tMh4659su9pP7Hjbn6nuPBNuTHmuq7fW6LKJeWpump");