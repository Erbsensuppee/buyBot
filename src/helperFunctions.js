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


module.exports = { 
    formatNumber, 
    calculateMarketCap,
    calculateTokens,
    calculateSolana
};
