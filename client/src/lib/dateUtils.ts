/**
 * Date and Time Formatting Utilities
 * Timezone-aware formatting based on business location
 */

interface SystemInfo {
  currentTime: string;
  timezone: string;
  timezoneOffset: number;
  timezoneAbbr: string;
  location: {
    businessName: string;
    city: string;
    full: string;
  };
  format: {
    time: '12' | '24';
    date: string;
  };
}

/**
 * Format time in business timezone
 * @param date - Date to format (defaults to current time)
 * @param systemInfo - System configuration (timezone, format preferences)
 * @returns Formatted time string (e.g., "3:45:23 PM" or "15:45:23")
 */
export function formatTime(date: Date, systemInfo: SystemInfo): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: systemInfo.timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: systemInfo.format.time === '12',
  });

  return formatter.format(date);
}

/**
 * Format date in business timezone with day of week
 * @param date - Date to format
 * @param systemInfo - System configuration
 * @returns Formatted date string (e.g., "Mon 10/22" for mobile-friendly format)
 */
export function formatDate(date: Date, systemInfo: SystemInfo): string {
  const formatter = new Intl.DateTimeFormat(systemInfo.format.date, {
    timeZone: systemInfo.timezone,
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  });

  return formatter.format(date);
}

/**
 * Format full date with year
 * @param date - Date to format
 * @param systemInfo - System configuration
 * @returns Formatted date string (e.g., "Monday, October 22, 2025")
 */
export function formatFullDate(date: Date, systemInfo: SystemInfo): string {
  const formatter = new Intl.DateTimeFormat(systemInfo.format.date, {
    timeZone: systemInfo.timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return formatter.format(date);
}

/**
 * Format datetime with timezone abbreviation
 * @param date - Date to format
 * @param systemInfo - System configuration
 * @returns Formatted datetime string (e.g., "Oct 22, 2025 at 3:45 PM EST")
 */
export function formatDateTime(date: Date, systemInfo: SystemInfo): string {
  const dateFormatter = new Intl.DateTimeFormat(systemInfo.format.date, {
    timeZone: systemInfo.timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: systemInfo.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: systemInfo.format.time === '12',
  });

  const dateStr = dateFormatter.format(date);
  const timeStr = timeFormatter.format(date);

  return `${dateStr} at ${timeStr} ${systemInfo.timezoneAbbr}`;
}

/**
 * Format relative time (e.g., "2 hours ago", "just now")
 * @param date - Date to compare against current time
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  } else if (diffDay < 30) {
    return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  } else {
    // For older dates, show the actual date
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
}

/**
 * Parse ISO timestamp to Date in business timezone
 * @param isoString - ISO 8601 timestamp string
 * @returns Date object
 */
export function parseISOToDate(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Convert Date to ISO string for database storage (always UTC)
 * @param date - Date to convert
 * @returns ISO 8601 timestamp string
 */
export function dateToISO(date: Date): string {
  return date.toISOString();
}
