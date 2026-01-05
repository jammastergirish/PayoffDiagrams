
const Papa = require('papaparse');

const csvData = `Drill Down,Financial Instrument,Underlying Price,Last,Change %,Position,Unrealized P&L,Daily P&L,Daily P&L %,Market Value,Cost Basis,Delta,Gamma,Vega,Theta,
,MU Feb20'26 300 PUT,,18.90,'-0.39384220654265545,'-4,616,"4,964",2.11%,"'-7,509","'-8,125",'-0.360,0.006,0.425,'-0.244,
,MU,,324.59,0.029072347980470533,400,"24,767","3,652",1.56%,"129,820","105,053",,,,,
`;

function cleanNumber(value) {
    if (value === null || value === undefined) return 0.0;
    if (typeof value === 'number') return value;

    let cleaned = String(value).trim();
    if (cleaned === '') return 0.0;

    // Handle negatives like (123.45)
    const isParenNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
    if (isParenNegative) {
        cleaned = cleaned.slice(1, -1).trim();
    }

    // Remove commas, quotes, currency symbols
    cleaned = cleaned.replace(/,/g, '').replace(/'/g, '').replace(/"/g, '').replace(/^\$/, '');
    
    // Remove option side prefixes often found in IBKR like C5.16 or P0.26
    cleaned = cleaned.replace(/^[CP](?=\d|\.)/i, '');

    if (isParenNegative && !cleaned.startsWith('-')) {
        cleaned = '-' + cleaned;
    }

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0.0 : num;
}

Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
        const row = results.data[1]; // MU Stock row
        console.log("Keys found:", Object.keys(row));
        console.log("Raw Unrealized P&L:", row['Unrealized P&L']);
        console.log("Cleaned:", cleanNumber(row['Unrealized P&L']));
        
        const rowPut = results.data[0]; // Put row
        console.log("PUT Raw Unrealized P&L:", rowPut['Unrealized P&L']);
        console.log("PUT Cleaned:", cleanNumber(rowPut['Unrealized P&L']));
    }
});
