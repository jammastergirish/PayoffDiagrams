
export interface Position {
  ticker: string;
  position_type: 'stock' | 'call' | 'put';
  qty: number;
  strike?: number;
  cost_basis?: number;
  expiry?: string;
  dte?: number;
  unrealized_pnl?: number;
}

export function cleanNumber(value: unknown): number {
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

export function parseFinancialInstrument(instrument: string): { ticker: string; type: 'stock' | 'call' | 'put'; strike?: number; expiry?: string } {
    if (!instrument) return { ticker: '', type: 'stock' };

    instrument = String(instrument).trim();

    // Check if it's just a ticker (stock) - no CALL/PUT keywords
    if (!instrument.includes(' CALL') && !instrument.includes(' PUT')) {
        return { ticker: instrument.toUpperCase(), type: 'stock' };
    }

    // Parse option format: "IREN Jan30'26 40 CALL" or "NVDA Jun18'26 200 CALL"
    // Pattern: TICKER MonthDD'YY Strike CALL/PUT
    const pattern = /^([A-Z0-9.-]+)\s+([A-Za-z]{3})(\d{1,2})'(\d{2})\s+(\d+(?:\.\d+)?)\s+(CALL|PUT)$/i;
    const match = instrument.match(pattern);

    if (match) {
        const ticker = match[1].toUpperCase();
        const monthStr = match[2]; // e.g., 'Jan'
        const day = match[3];
        const yearShort = match[4];
        const strike = parseFloat(match[5]);
        const optType = match[6].toLowerCase() as 'call' | 'put';

        // Convert month abbreviation to number
        const monthMap: Record<string, string> = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        
        // Handle title case months just in case
        const monthTitle = monthStr.charAt(0).toUpperCase() + monthStr.slice(1).toLowerCase();
        const month = monthMap[monthTitle] || '01';
        const year = `20${yearShort}`;
        const expiry = `${year}-${month}-${day.padStart(2, '0')}`;

        return {
            ticker,
            type: optType,
            strike,
            expiry
        };
    }

    return { ticker: instrument.toUpperCase(), type: 'stock' };
}

export function calculatePnl(positions: Position[], prices: number[]): number[] {
    // Returns array of P&L values corresponding to the prices array
    const totalPnl = new Array(prices.length).fill(0);

    for (const pos of positions) {
        const qty = pos.qty;
        const costBasis = pos.cost_basis || 0;

        if (pos.position_type === 'stock') {
            for (let i = 0; i < prices.length; i++) {
                totalPnl[i] += (prices[i] - costBasis) * qty;
            }
        } else if (pos.position_type === 'call') {
            const strike = pos.strike || 0;
            for (let i = 0; i < prices.length; i++) {
                const intrinsic = Math.max(0, prices[i] - strike);
                // Universal formula: P&L = (Exit - Entry) * Qty
                // Entry is always positive cost basis
                totalPnl[i] += (intrinsic - costBasis) * qty * 100;
            }
        } else if (pos.position_type === 'put') {
            const strike = pos.strike || 0;
            for (let i = 0; i < prices.length; i++) {
                const intrinsic = Math.max(0, strike - prices[i]);
                totalPnl[i] += (intrinsic - costBasis) * qty * 100;
            }
        }
    }
    return totalPnl;
}

export function getBreakevens(prices: number[], pnl: number[]): number[] {
    if (prices.length !== pnl.length) return [];
    
    const breakevens: number[] = [];
    
    for (let i = 0; i < pnl.length - 1; i++) {
        const v1 = pnl[i];
        const v2 = pnl[i+1];
        
        // Check for sign change
        if ((v1 >= 0 && v2 < 0) || (v1 < 0 && v2 >= 0)) {
            if (v1 === v2) continue; // Avoid division by zero
            
            const p1 = prices[i];
            const p2 = prices[i+1];
            
            // Linear interpolation: x = x1 + (0 - y1) * (x2 - x1) / (y2 - y1)
            const zeroPrice = p1 + (0 - v1) * (p2 - p1) / (v2 - v1);
            breakevens.push(zeroPrice);
        }
    }
    return breakevens;
}

export function analyzeRiskReward(pnl: number[]) {
    // Warning: this assumes the pnl array covers a sufficient range
    if(pnl.length === 0) return { maxProfit: 0, maxLoss: 0 };
    
    let maxProfit = -Infinity;
    let maxLoss = Infinity;
    
    for (const val of pnl) {
        if (val > maxProfit) maxProfit = val;
        if (val < maxLoss) maxLoss = val;
    }
    
    return { maxProfit, maxLoss };
}

export function getPriceRange(positions: Position[], currentPrice: number): number[] {
    let minStrike = Infinity;
    let maxStrike = -Infinity;
    let hasOptions = false;

    positions.forEach(p => {
        if (p.strike) {
            hasOptions = true;
            if (p.strike < minStrike) minStrike = p.strike;
            if (p.strike > maxStrike) maxStrike = p.strike;
        }
    });

    let low, high;
    if (hasOptions && minStrike !== Infinity) {
        low = Math.min(minStrike * 0.8, currentPrice * 0.7);
        high = Math.max(maxStrike * 1.2, currentPrice * 1.3);
    } else {
        low = currentPrice * 0.7;
        high = currentPrice * 1.3;
    }

    // Generate 200 points
    const points = 200;
    const step = (high - low) / (points - 1);
    const range = [];
    for (let i = 0; i < points; i++) {
        range.push(low + i * step);
    }
    return range;
}

export function calculateDte(expiryDate: string): number {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function findColumn(row: Record<string, unknown>, keyPart: string): string | undefined {
    const keys = Object.keys(row);
    // 1. Exact match
    if (keys.includes(keyPart)) return keyPart;
    
    // 2. Case insensitive match or Trimmed match
    const lowerKey = keyPart.toLowerCase();
    const match = keys.find(k => k.trim().toLowerCase() === lowerKey || k.toLowerCase().includes(lowerKey));
    return match;
}
