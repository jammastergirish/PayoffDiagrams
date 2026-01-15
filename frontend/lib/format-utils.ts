export const formatCurrency = (value: number, decimals = 0): string =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;

export const formatCurrencyOrInfinity = (value: number): string =>
  Number.isFinite(value) ? formatCurrency(value) : "∞";

export const formatPercent = (value: number, decimals = 1): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;

export const formatNumber = (value: number, decimals = 0): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: decimals });

export const formatPrivateCurrency = (value: number, privacyMode: boolean, decimals = 0): string =>
  privacyMode ? '***' : formatCurrency(value, decimals);

export const formatRelativeTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}/${day}`;
};