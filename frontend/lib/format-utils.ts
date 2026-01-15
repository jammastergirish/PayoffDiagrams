/**
 * Centralized formatting utilities for consistent number, currency, and data display
 * across the application. Eliminates 50+ duplicate formatting patterns.
 */

// Currency formatter with consistent decimal places
const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

const currencyFormatterWithCents = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

// Number formatter for general use
const numberFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * Format currency values with smart decimal handling
 * @param value - The numeric value to format
 * @param showCents - Whether to show cents (default: false for whole dollars)
 */
export function formatCurrency(value: number | null | undefined, showCents: boolean = false): string {
    if (value == null || isNaN(value)) return "$0";
    return showCents ? currencyFormatterWithCents.format(value) : currencyFormatter.format(value);
}

/**
 * Format currency with explicit decimal places
 * @param value - The numeric value to format
 * @param decimals - Number of decimal places (0-2)
 */
export function formatCurrencyFixed(value: number | null | undefined, decimals: 0 | 1 | 2 = 2): string {
    if (value == null || isNaN(value)) return "$0";
    return `$${value.toFixed(decimals)}`;
}

/**
 * Format large numbers with K/M/B suffixes
 * @param value - The numeric value to format
 * @param decimals - Number of decimal places for the suffix
 */
export function formatCompactNumber(value: number | null | undefined, decimals: number = 1): string {
    if (value == null || isNaN(value)) return "0";

    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";

    if (absValue >= 1_000_000_000) {
        return `${sign}${(absValue / 1_000_000_000).toFixed(decimals)}B`;
    }
    if (absValue >= 1_000_000) {
        return `${sign}${(absValue / 1_000_000).toFixed(decimals)}M`;
    }
    if (absValue >= 1_000) {
        return `${sign}${(absValue / 1_000).toFixed(decimals)}K`;
    }
    return `${sign}${absValue.toFixed(0)}`;
}

/**
 * Format volume with smart K/M/B suffixes
 * @param volume - The volume value to format
 */
export function formatVolume(volume: number | null | undefined): string {
    return formatCompactNumber(volume, 1);
}

/**
 * Format percentage values
 * @param value - The decimal value to format as percentage (0.05 = 5%)
 * @param showSign - Whether to show + for positive values
 */
export function formatPercent(value: number | null | undefined, showSign: boolean = false): string {
    if (value == null || isNaN(value)) return "0%";

    const formatted = percentFormatter.format(value / 100); // Dividing by 100 since we expect percentage values
    if (showSign && value > 0) {
        return `+${formatted}`;
    }
    return formatted;
}

/**
 * Format percentage with fixed decimal places
 * @param value - The percentage value (5 = 5%, not 0.05)
 * @param decimals - Number of decimal places
 * @param showSign - Whether to show + for positive values
 */
export function formatPercentFixed(
    value: number | null | undefined,
    decimals: number = 2,
    showSign: boolean = false
): string {
    if (value == null || isNaN(value)) return "0%";

    const formatted = `${value.toFixed(decimals)}%`;
    if (showSign && value > 0) {
        return `+${formatted}`;
    }
    return formatted;
}

/**
 * Format general numbers with appropriate precision
 * @param value - The numeric value to format
 * @param decimals - Maximum decimal places (default: 2)
 */
export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
    if (value == null || isNaN(value)) return "0";

    // Remove trailing zeros
    const formatted = value.toFixed(decimals);
    return parseFloat(formatted).toString();
}

/**
 * Format price values (similar to currency but without $ sign)
 * @param value - The price value
 * @param decimals - Number of decimal places (default: 2)
 */
export function formatPrice(value: number | null | undefined, decimals: number = 2): string {
    if (value == null || isNaN(value)) return "0";
    return value.toFixed(decimals);
}

/**
 * Format change values with color coding
 * Returns both formatted string and suggested color class
 */
export function formatChange(
    value: number | null | undefined,
    isPercent: boolean = false
): { text: string; colorClass: string } {
    if (value == null || isNaN(value)) {
        return { text: isPercent ? "0%" : "$0", colorClass: "text-gray-400" };
    }

    const text = isPercent
        ? formatPercentFixed(value, 2, true)
        : formatCurrencyFixed(value, 2);

    const colorClass = value > 0
        ? "text-green-400"
        : value < 0
        ? "text-red-400"
        : "text-gray-400";

    return { text, colorClass };
}

/**
 * Format date/time consistently
 * @param dateString - ISO date string or Date object
 * @param showTime - Whether to include time
 */
export function formatDateTime(
    dateString: string | Date | null | undefined,
    showTime: boolean = false
): string {
    if (!dateString) return "";

    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

    if (showTime) {
        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    }

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

/**
 * Format options strike price
 * @param strike - The strike price
 */
export function formatStrike(strike: number | null | undefined): string {
    if (strike == null || isNaN(strike)) return "0";

    // For whole number strikes, don't show decimals
    if (strike % 1 === 0) {
        return strike.toString();
    }

    // For fractional strikes, show up to 2 decimals
    return formatPrice(strike, 2);
}

/**
 * Format Greeks (delta, gamma, theta, vega)
 * @param value - The greek value
 * @param type - The type of greek for appropriate formatting
 */
export function formatGreek(
    value: number | null | undefined,
    type: 'delta' | 'gamma' | 'theta' | 'vega' | 'iv'
): string {
    if (value == null || isNaN(value)) return "-";

    switch (type) {
        case 'delta':
        case 'gamma':
            return value.toFixed(3);
        case 'theta':
        case 'vega':
            return value.toFixed(2);
        case 'iv':
            return formatPercentFixed(value * 100, 1); // IV comes as decimal
        default:
            return value.toFixed(2);
    }
}

/**
 * Format currency values or show infinity symbol for unlimited values
 * @param value - The numeric value to format
 * @param showCents - Whether to show cents (default: false)
 */
export function formatCurrencyOrInfinity(value: number | null | undefined, showCents: boolean = false): string {
    if (value == null || isNaN(value)) return "$0";
    if (!isFinite(value)) return value > 0 ? "∞" : "-∞";
    return formatCurrency(value, showCents);
}

/**
 * Format currency with privacy mode support
 * @param value - The numeric value to format
 * @param privacyMode - Whether to hide the actual value
 * @param showCents - Whether to show cents (default: false)
 */
export function formatPrivateCurrency(
    value: number | null | undefined,
    privacyMode: boolean,
    showCents: boolean = false
): string {
    if (privacyMode) {
        return "****";
    }
    return formatCurrency(value, showCents);
}

/**
 * Format time as relative (e.g., "2 hours ago", "3 days ago")
 * @param dateString - ISO date string or Date object
 */
export function formatRelativeTime(dateString: string | Date | null | undefined): string {
    if (!dateString) return "";

    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
        return "just now";
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    }

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
        return `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
        return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
    }

    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
}