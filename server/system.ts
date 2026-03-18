/**
 * System Information Utilities
 * Provides time, location, and business configuration info
 */

export interface SystemInfo {
  currentTime: string;        // ISO 8601 format
  timezone: string;           // IANA timezone (e.g., "America/New_York")
  timezoneOffset: number;     // Minutes offset from UTC
  timezoneAbbr: string;       // Current abbreviation (EST or EDT)
  location: {
    businessName: string;
    city: string;
    full: string;             // Full location string
  };
  format: {
    time: '12' | '24';
    date: string;             // Locale code
  };
}

/**
 * Get current timezone abbreviation (EST vs EDT, PST vs PDT, etc.)
 */
export function getTimezoneAbbreviation(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.BUSINESS_TIMEZONE || 'America/New_York',
    timeZoneName: 'short',
  });

  const parts = formatter.formatToParts(now);
  const tzPart = parts.find(part => part.type === 'timeZoneName');

  return tzPart?.value || 'EST';
}

/**
 * Get timezone offset in minutes
 */
export function getTimezoneOffset(): number {
  const timezone = process.env.BUSINESS_TIMEZONE || 'America/New_York';

  // Create formatter for the business timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Get time in business timezone
  const tzDateStr = formatter.format(now);

  // Parse and compare with UTC
  const utcOffset = now.getTimezoneOffset(); // Client's UTC offset

  // For server, we'll return the standard offset for the timezone
  // EST = UTC-5 = -300 minutes, EDT = UTC-4 = -240 minutes
  const offsetMap: Record<string, number> = {
    'EST': -300,
    'EDT': -240,
    'PST': -480,
    'PDT': -420,
    'CST': -360,
    'CDT': -300,
    'MST': -420,
    'MDT': -360,
  };

  const abbr = getTimezoneAbbreviation();
  return offsetMap[abbr] || -300; // Default to EST
}

/**
 * Get complete system information
 */
export function getSystemInfo(): SystemInfo {
  const timezone = process.env.BUSINESS_TIMEZONE || 'America/New_York';
  const location = process.env.BUSINESS_LOCATION || 'Chesapeake, VA';
  const businessName = process.env.BUSINESS_NAME || 'Nexus Clothing';

  // Extract city from location (everything before the comma)
  const city = location.split(',')[0].trim();

  return {
    currentTime: new Date().toISOString(),
    timezone,
    timezoneOffset: getTimezoneOffset(),
    timezoneAbbr: getTimezoneAbbreviation(),
    location: {
      businessName,
      city,
      full: location,
    },
    format: {
      time: (process.env.TIME_FORMAT || '12') as '12' | '24',
      date: process.env.DATE_FORMAT || 'en-US',
    },
  };
}

/**
 * Format time in business timezone
 */
export function formatTimeInBusinessTZ(date: Date = new Date()): string {
  const timezone = process.env.BUSINESS_TIMEZONE || 'America/New_York';
  const timeFormat = process.env.TIME_FORMAT || '12';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: timeFormat === '12',
  });

  return formatter.format(date);
}

/**
 * Format date in business timezone
 */
export function formatDateInBusinessTZ(date: Date = new Date()): string {
  const timezone = process.env.BUSINESS_TIMEZONE || 'America/New_York';
  const locale = process.env.DATE_FORMAT || 'en-US';

  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return formatter.format(date);
}
