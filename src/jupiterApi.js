const axios = require("axios");

const JUPITER_V6_API_PUMP = "https://quote-api.jup.ag/v6";
const JUPITER_V6_API = "https://api.jup.ag/swap/v1";
const JUPITER_V1_QUOTE = "https://api.jup.ag/swap/v1/quote";

const feeAccount = "2XcBU91etyeUAcrkvpY4H3HDPRnaC9eVfCpfsrgjf4YV";
//const feeAccount = "5KMcyGvqwd95wgFiK6Q9rSA5w9sBrDcUE1bP6cNt9Qqj";
const platformFeeBps = 20; // 0.2% Fee

/** 
 * Get a swap quote from Jupiter.
 * @param {string} inputMint - Token being swapped.
 * @param {string} outputMint - Token to receive.
 * @param {number} amount - Amount of input token.
 * @param {number} slippageBps - Slippage in basis points.
 * @param {boolean} feeIsTrue - Whether to include the platform fee.
 */
async function getQuote(inputMint, outputMint, amount, slippageBps, feeIsTrue) {
    try {
        const params = {
            inputMint,
            outputMint,
            amount,
            slippageBps,
        };

        if (feeIsTrue) {
            params.platformFeeBps = platformFeeBps;
        }

        const response = await axios.get(JUPITER_V1_QUOTE, { params });
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching quote:", error.response ? error.response.data : error.message);
        return null;
    }
}

/** 
 * Get a swap quote from Jupiter.
 * @param {string} inputMint - Token being swapped.
 * @param {string} outputMint - Token to receive.
 * @param {number} amount - Amount of input token.
 * @param {number} slippageBps - Slippage in basis points.
 * @param {boolean} feeIsTrue - Whether to include the platform fee.
 */
async function getBuyQuote(inputMint, outputMint, amount, slippageBps) {
    try {
        const params = {
            inputMint,
            outputMint,
            amount,
            slippageBps,
        };

        const response = await axios.get(JUPITER_V1_QUOTE, { params });
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching quote:", error.response ? error.response.data : error.message);
        return null;
    }
}

/** 
 * Get a swap quote from Jupiter.
 * @param {string} inputMint - Token being swapped.
 * @param {string} outputMint - Token to receive.
 * @param {number} amount - Amount of input token.
 * @param {number} slippageBps - Slippage in basis points.
 * @param {boolean} feeIsTrue - Whether to include the platform fee.
 */
async function getSellQuote(inputMint, outputMint, amount, slippageBps) {
    try {
        const params = {
            inputMint,
            outputMint,
            amount,
            slippageBps,
            platformFeeBps
        };

        const response = await axios.get(JUPITER_V1_QUOTE, { params });
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching quote:", error.response ? error.response.data : error.message);
        return null;
    }
}


/**
 * Get swap instructions from Jupiter.
 * @param {Object} quoteResponse - Response from Jupiter quote API.
 * @param {string} userPublicKey - User's public key.
 * @param {boolean} feeIsTrue - Whether to include fee.
 */
async function getSwapInstructions(quoteResponse, userPublicKey, feeIsTrue) {
    try {
        const body = {
            quoteResponse,
            userPublicKey,
            //wrapUnwrapSOL: true, // Ensures SOL is wrapped/unwrapped properly
        };

        if (feeIsTrue) {
            body.feeAccount = feeAccount;
        }

        const response = await axios.post(`${JUPITER_V6_API}/swap-instructions`, body);
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching swap instructions:", error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Get swap instructions from Jupiter.
 * @param {Object} quoteResponse - Response from Jupiter quote API.
 * @param {string} userPublicKey - User's public key.
 * @param {boolean} feeIsTrue - Whether to include fee.
 */
async function getBuySwapInstructions(quoteResponse, userPublicKey) {
    try {
        const body = {
            quoteResponse,
            userPublicKey,
            wrapUnwrapSOL: true,
        };

        const response = await axios.post(`${JUPITER_V6_API}/swap-instructions`, body);
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching swap instructions:", error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Get swap instructions from Jupiter.
 * @param {Object} quoteResponse - Response from Jupiter quote API.
 * @param {string} userPublicKey - User's public key.
 * @param {boolean} feeIsTrue - Whether to include fee.
 */
async function getSellSwapInstructions(quoteResponse, userPublicKey) {
    try {
        const body = {
            quoteResponse,
            userPublicKey,
            wrapUnwrapSOL: true, // Ensures SOL is wrapped/unwrapped properly
            feeAccount,

        };

        const response = await axios.post(`${JUPITER_V6_API}/swap-instructions`, body);
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching swap instructions:", error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Execute the swap.
 * @param {Object} quoteResponse - Response from Jupiter quote API.
 * @param {string} userPublicKey - User's public key.
 * @param {boolean} feeIsTrue - Whether to include fee.
 */
async function getSwapResponse(quoteResponse, userPublicKey, feeIsTrue) {
    try {
        const body = {
            quoteResponse,
            userPublicKey,
        };

        if (feeIsTrue) {
            body.feeAccount = feeAccount;
        }

        const response = await axios.post(`${JUPITER_V6_API}/swap`, body);
        return response.data;
    } catch (error) {
        console.error("❌ Error executing swap:", error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = { getQuote, 
    getSwapInstructions, 
    getSwapResponse, 
    getBuyQuote, 
    getSellQuote,
    getBuySwapInstructions,
    getSellSwapInstructions };
