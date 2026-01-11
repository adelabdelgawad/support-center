/**
 * Utility functions for the application
 *
 * This file contains commonly used utility functions,
 * including the `cn` function for combining Tailwind classes.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names with Tailwind CSS merge support
 * This prevents conflicting Tailwind classes from being applied.
 *
 * Usage:
 * ```ts
 * cn("px-2 py-1", isActive() && "bg-primary", props.class)
 * ```
 *
 * @param inputs - Class values to combine
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string to a readable format
 * @param dateString - ISO date string
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date string to include time
 * @param dateString - ISO date string (expected to be UTC from backend)
 * @returns Formatted date and time string in user's local timezone
 */
export function formatDateTime(dateString: string | undefined | null): string {
  if (!dateString) return '';

  // CRITICAL: Backend sends timestamps in UTC
  // Timestamps may come in different formats:
  // - With 'Z' suffix: "2025-12-22T14:25:00Z" (explicit UTC)
  // - With offset: "2025-12-22T14:25:00+00:00" (explicit timezone)
  // - Without timezone: "2025-12-22T14:25:00" (assumed UTC from backend)

  let normalizedDateString = dateString;

  // If no timezone info is present, assume UTC (append 'Z')
  // This ensures consistent interpretation across browsers
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
    normalizedDateString = dateString + 'Z';
  }

  // Parse the date
  const date = new Date(normalizedDateString);

  // Validate date
  if (isNaN(date.getTime())) {
    console.warn('[formatDateTime] Invalid date:', dateString);
    return dateString;
  }

  // Format using user's LOCAL timezone (no timeZone option = browser's local timezone)
  return new Intl.DateTimeFormat('en-US', {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Format a date to relative time (e.g., "2 hours ago")
 * @param dateString - ISO date string
 * @returns Relative time string
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

/**
 * Truncate text to a maximum length
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis if needed
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
