const axios = require("axios");

const JUPITER_V6_API_PUMP = "https://quote-api.jup.ag/v6";
const JUPITER_V6_API = "https://api.jup.ag/swap/v1"
const JUPITER_V1_QUOTE = "https://api.jup.ag/swap/v1/quote"

async function getQuote(inputMint, outputMint, amount, slippageBps) {
    const response = await axios.get(`${JUPITER_V1_QUOTE}`, {
        params: {
        inputMint,
        outputMint,
        amount,
        slippageBps,
        },
    });
    return response.data;
}
  
async function getSwapInstructions(quoteResponse, userPublicKey) {
    const response = await axios.post(`${JUPITER_V6_API}/swap-instructions`, {
        quoteResponse,
        userPublicKey,
        wrapUnwrapSOL: true,
    });
    return response.data;
}

async function getSwapResponse(quoteResponse, userPublicKey) {
    const response = await axios.post(`${JUPITER_V6_API}/swap`, {
        quoteResponse,
        userPublicKey,
        //wrapUnwrapSOL: true,
    });
    return response.data;
}

module.exports = { getQuote, getSwapInstructions, getSwapResponse};