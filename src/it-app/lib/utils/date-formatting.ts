/**
 * DateTime formatting utilities with automatic local timezone detection
 * All functions use the user's browser timezone and 12-hour format
 *
 * Timestamps from the backend are in UTC (ISO 8601 with "Z" suffix).
 * These utilities automatically convert them to the user's local timezone.
 */

/**
 * Get the user's local timezone from the browser.
 * Returns the IANA timezone identifier (e.g., "America/New_York", "Europe/London", "Africa/Cairo")
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get timezone abbreviation for display (e.g., "EST", "EET", "GMT")
 */
export function getTimezoneAbbreviation(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
  });
  const parts = formatter.formatToParts(date);
  const tzPart = parts.find(part => part.type === 'timeZoneName');
  return tzPart?.value || '';
}

/**
 * Get timezone offset string (e.g., "UTC+2", "UTC-5")
 */
export function getTimezoneOffset(): string {
  const offsetMinutes = new Date().getTimezoneOffset();
  const offsetHours = -offsetMinutes / 60; // Negate because getTimezoneOffset returns opposite sign
  const sign = offsetHours >= 0 ? '+' : '';
  return `UTC${sign}${offsetHours}`;
}

/**
 * Format chat message timestamp: "Monday 11:23 PM"
 * Uses user's local timezone automatically
 */
export function formatChatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    // No timeZone specified = uses browser's local timezone
  }).format(date);
}

/**
 * Format ticket timestamp with relative time or full date
 * Returns "X hours ago" or "Jan 15 11:23 PM"
 * Uses user's local timezone automatically
 */
export function formatTicketTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  // Show relative time for last 24 hours
  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  }

  // Show full date for older items (uses browser's local timezone)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Format date only: "Jan 15, 2025"
 * Uses user's local timezone automatically
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Format short datetime: "Jan 15 11:23 PM"
 * Uses user's local timezone automatically
 */
export function formatShortDateTime(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Format full datetime: "Monday, Jan 15, 2025 at 11:23 PM"
 * Uses user's local timezone automatically
 */
export function formatFullDateTime(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Format for chart axes: "Jan 15"
 * Uses user's local timezone automatically
 */
export function formatChartDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Check if a date is overdue (for due dates)
 */
export function isOverdue(dateString: string): boolean {
  const dueDate = new Date(dateString);
  const now = new Date();
  return dueDate < now;
}

/**
 * Format due date with overdue indication
 * Returns formatted date with appropriate styling info
 * Uses user's local timezone automatically
 */
export function formatDueDate(dateString: string): {
  formatted: string;
  isOverdue: boolean;
  daysOverdue?: number;
} {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);

  return {
    formatted,
    isOverdue: diffMs > 0,
    daysOverdue: diffMs > 0 ? diffDays : undefined,
  };
}

/**
 * Format datetime with timezone indicator: "Jan 15 11:23 PM EET"
 * Useful when users need to see which timezone the time is displayed in
 */
export function formatDateTimeWithTimezone(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date);
}

/**
 * Format time only with timezone: "11:23 PM EET"
 */
export function formatTimeWithTimezone(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date);
}
