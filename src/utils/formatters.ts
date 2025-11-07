/**
 * Safe formatting utilities for Android Chrome compatibility
 * These functions prevent crashes from invalid dates, null values, and NaN
 */

/**
 * Safely format a date with fallback for invalid dates
 */
export const safeFormatDate = (
  date: string | Date | null | undefined,
  locale: string = 'sv-SE',
  fallback: string = 'Ogiltigt datum'
): string => {
  if (!date) return fallback;

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return fallback;
    }

    return dateObj.toLocaleString(locale);
  } catch (error) {
    console.error('Date formatting error:', error);
    return fallback;
  }
};

/**
 * Safely format a date to date-only string
 */
export const safeFormatDateOnly = (
  date: string | Date | null | undefined,
  locale: string = 'sv-SE',
  fallback: string = 'Ogiltigt datum'
): string => {
  if (!date) return fallback;

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return fallback;
    }

    return dateObj.toLocaleDateString(locale);
  } catch (error) {
    console.error('Date formatting error:', error);
    return fallback;
  }
};

/**
 * Safely format file size in MB with fallback for invalid numbers
 */
export const safeFormatFileSize = (
  bytes: number | null | undefined,
  fallback: string = 'Okänd storlek'
): string => {
  if (bytes === null || bytes === undefined) return fallback;

  try {
    const num = Number(bytes);

    // Check if number is valid
    if (isNaN(num) || !isFinite(num)) {
      return fallback;
    }

    const mb = num / 1024 / 1024;

    // Check if result is valid before calling toFixed
    if (isNaN(mb) || !isFinite(mb)) {
      return fallback;
    }

    return `${mb.toFixed(2)} MB`;
  } catch (error) {
    console.error('File size formatting error:', error);
    return fallback;
  }
};

/**
 * Safely format a number with fixed decimal places
 */
export const safeToFixed = (
  value: number | null | undefined,
  decimals: number = 2,
  fallback: string = '0'
): string => {
  if (value === null || value === undefined) return fallback;

  try {
    const num = Number(value);

    // Check if number is valid
    if (isNaN(num) || !isFinite(num)) {
      return fallback;
    }

    return num.toFixed(decimals);
  } catch (error) {
    console.error('Number formatting error:', error);
    return fallback;
  }
};

/**
 * Safely get a URL with fallback for null/undefined
 */
export const safeUrl = (
  url: string | null | undefined,
  fallback: string = '#'
): string => {
  if (!url || url === 'undefined' || url === 'null') {
    return fallback;
  }

  return url;
};

/**
 * Safely check if a value is a valid URL
 */
export const isValidUrl = (url: string | null | undefined): boolean => {
  if (!url || url === 'undefined' || url === 'null') {
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    // If it's a relative URL, check if it starts with /
    return url.startsWith('/');
  }
};
