'use client';

import { useEffect, useState } from 'react';
import {
  formatTicketTimestamp as baseFormatTicketTimestamp,
} from './date-formatting';

/**
 * Format date with explicit UTC timezone for SSR consistency.
 * Both server and client will produce the same string during hydration.
 */
function formatShortDateTimeUTC(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Hydration-safe date formatting hook.
 * Returns a stable initial value during SSR and updates after hydration.
 *
 * This prevents hydration mismatches when using Date.now() or relative timestamps
 * that differ between server render and client hydration.
 *
 * @param dateString - ISO date string to format
 * @param formatterFn - Optional custom formatter function (defaults to formatTicketTimestamp)
 * @returns Formatted date string
 */
export function useFormattedDate(
  dateString: string,
  formatterFn?: (date: string) => string
): string {
  const [isHydrated, setIsHydrated] = useState(false);
  const [formattedDate, setFormattedDate] = useState(() =>
    // Use UTC formatting during SSR to ensure server/client produce identical strings
    formatShortDateTimeUTC(dateString)
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional hydration pattern
    setIsHydrated(true);
    // After hydration, use the requested formatter (may be relative)
    setFormattedDate(formatterFn ? formatterFn(dateString) : baseFormatTicketTimestamp(dateString));
  }, [dateString, formatterFn]);

  return formattedDate;
}

/**
 * Hydration-safe due date formatter hook.
 * Returns stable initial value during SSR and updates after hydration.
 */
export function useFormattedDueDate(
  dateString: string | null
): { text: string; isOverdue: boolean } {
  const [isHydrated, setIsHydrated] = useState(false);
  const [result, setResult] = useState(() => formatDueDateInternal(dateString, false));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional hydration pattern
    setIsHydrated(true);
    setResult(formatDueDateInternal(dateString, true));
  }, [dateString]);

  return result;
}

/**
 * Internal due date formatter
 * Uses absolute formatting during SSR, relative after hydration
 */
function formatDueDateInternal(
  dateString: string | null,
  useRelative: boolean
): { text: string; isOverdue: boolean } {
  if (!dateString) return { text: '-', isOverdue: false };

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return { text: '-', isOverdue: false };
  }

  const now = new Date();
  const isOverdue = date < now;

  // During SSR or before hydration, use UTC formatting for consistency
  if (!useRelative) {
    return {
      text: formatShortDateTimeUTC(dateString),
      isOverdue,
    };
  }

  // After hydration, use relative formatting
  const diffMs = Math.abs(date.getTime() - now.getTime());
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let text: string;

  if (diffDays > 0) {
    text = `${diffDays}d ${diffHours % 24}h`;
  } else {
    text = `${diffHours}h`;
  }

  if (isOverdue) {
    text = `${text} overdue`;
  } else {
    text = `in ${text}`;
  }

  return { text, isOverdue };
}

/**
 * Hydration-safe chat timestamp formatter.
 * Returns UTC-formatted timestamp during SSR to match server output,
 * then updates to local timezone after hydration.
 *
 * This prevents hydration mismatches caused by timezone differences
 * between server (UTC) and client (user's local timezone).
 *
 * @param dateString - ISO date string to format
 * @returns Formatted timestamp (e.g., "Wednesday, 3:00 PM")
 */
export function useFormattedChatTimestamp(dateString: string): string {
  const [isHydrated, setIsHydrated] = useState(false);
  const [formattedDate, setFormattedDate] = useState(() =>
    // Use UTC during SSR to ensure consistency with server output
    formatChatTimestampUTC(dateString)
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional hydration pattern
    setIsHydrated(true);
    // After hydration, use local timezone
    setFormattedDate(formatChatTimestampLocal(dateString));
  }, [dateString]);

  return formattedDate;
}

/**
 * Format timestamp with UTC timezone (for SSR consistency)
 */
function formatChatTimestampUTC(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC', // Explicit UTC for server-side consistency
  }).format(date);
}

/**
 * Format timestamp with local timezone (for client-side display)
 */
function formatChatTimestampLocal(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    // No timeZone specified = uses browser's local timezone
  }).format(date);
}
