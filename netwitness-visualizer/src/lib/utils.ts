// Define constants outside functions to avoid recreation on every call
const BYTE_SIZES = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] as const;
const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
] as const;

/**
 * Formats a byte count into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) {
    return '0 B';
  }

  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // Guard against indices larger than our array length
  const safeIndex = Math.min(i, BYTE_SIZES.length - 1);

  const formattedValue = parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(2));
  return `${formattedValue} ${BYTE_SIZES[safeIndex]}`;
}

/**
 * Formats a number with comma separators.
 */
export function formatNumber(num: number): string {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0';
  }
  return NUMBER_FORMATTER.format(num);
}

/**
 * Formats epoch seconds into a UTC date string: DD-MMM-YYYY HH:mm:ss UTC
 */
export function formatDate(epochSeconds: number): string {
  // Explicitly check type/NaN so 0 (Unix Epoch) is handled correctly
  if (typeof epochSeconds !== 'number' || isNaN(epochSeconds)) {
    return 'N/A';
  }

  const date = new Date(epochSeconds * 1000);
  
  // Handle overly large numbers that result in Invalid Date
  if (isNaN(date.getTime())) {
    return 'N/A';
  }
  
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = MONTH_NAMES[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} UTC`;
}