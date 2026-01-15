export const getStrikeQuote = (
  chainData: Record<string, Record<string, unknown>> | undefined,
  expiry: string,
  strike: number
): unknown => {
  if (!chainData?.[expiry]) return undefined;
  const data = chainData[expiry];

  if (data[strike] !== undefined) return data[strike];

  const jsKey = String(strike);
  if (data[jsKey] !== undefined) return data[jsKey];

  const pyKey = Number.isInteger(strike) ? `${strike}.0` : String(strike);
  if (data[pyKey] !== undefined) return data[pyKey];

  const fixedKey = strike.toFixed(2);
  if (data[fixedKey] !== undefined) return data[fixedKey];

  return undefined;
};

export const formatExpiry = (expiry: string): string => {
  if (expiry.length === 8) {
    return `${expiry.slice(0,4)}-${expiry.slice(4,6)}-${expiry.slice(6,8)}`;
  }
  return expiry;
};

export const expiryWithoutDashes = (expiry: string): string => {
  return expiry.replace(/-/g, '');
};