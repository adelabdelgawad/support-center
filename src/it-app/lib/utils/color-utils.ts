/**
 * Color utility functions for UI styling
 */

import type { ChatStatus } from '@/lib/types';

/**
 * Chat status configuration for UI styling
 */
export const chatStatusConfig: Record<ChatStatus, { label: string; color: string; bgColor: string }> = {
  read: { label: 'Read', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  unread: { label: 'Unread', color: 'text-blue-700', bgColor: 'bg-blue-100' },
};

/**
 * Common color names to hex mapping
 * Supports both standard CSS colors and common color names
 */
const COLOR_NAME_TO_HEX: Record<string, string> = {
  // Standard colors
  red: '#EF4444',
  green: '#10B981',
  blue: '#3B82F6',
  yellow: '#F59E0B',
  orange: '#F97316',
  purple: '#8B5CF6',
  pink: '#EC4899',
  indigo: '#6366F1',
  teal: '#14B8A6',
  cyan: '#06B6D4',
  gray: '#6B7280',
  grey: '#6B7280',

  // Extended colors
  'light-red': '#FCA5A5',
  'light-green': '#86EFAC',
  'light-blue': '#93C5FD',
  'light-yellow': '#FDE047',
  'light-orange': '#FDBA74',
  'light-purple': '#C4B5FD',
  'light-pink': '#F9A8D4',

  'dark-red': '#DC2626',
  'dark-green': '#059669',
  'dark-blue': '#1D4ED8',
  'dark-yellow': '#D97706',
  'dark-orange': '#EA580C',
  'dark-purple': '#7C3AED',
  'dark-pink': '#DB2777',

  // Status colors
  pending: '#F59E0B',
  approved: '#10B981',
  rejected: '#EF4444',
  completed: '#3B82F6',

  // Neutral colors
  black: '#000000',
  white: '#FFFFFF',
  transparent: 'transparent',
};

/**
 * Normalize color input - converts color names to hex codes
 * @param color - Color string (hex or color name)
 * @returns Hex color string
 */
export function normalizeColor(color: string | undefined): string {
  if (!color) return '#9CA3AF'; // gray-400 fallback

  const trimmedColor = color.trim().toLowerCase();

  // If already a hex code, return it
  if (trimmedColor.startsWith('#')) {
    return trimmedColor;
  }

  // If it's a color name, convert to hex
  if (COLOR_NAME_TO_HEX[trimmedColor]) {
    return COLOR_NAME_TO_HEX[trimmedColor];
  }

  // If it's rgb/rgba format, return as-is
  if (trimmedColor.startsWith('rgb')) {
    return trimmedColor;
  }

  // Unknown color - return fallback
  console.warn(`Unknown color: ${color}, using gray fallback`);
  return '#9CA3AF';
}

/**
 * Convert hex color to RGBA string
 * @param color - Hex color string, color name, or rgb string
 * @param alpha - Alpha value (0-1)
 * @returns RGBA color string
 */
export function hexToRgba(color: string | undefined, alpha: number = 1): string {
  if (!color) return `rgba(156, 163, 175, ${alpha})`; // gray-400 fallback

  // Normalize color first (convert name to hex if needed)
  const normalizedColor = normalizeColor(color);

  // If already rgb/rgba, handle alpha adjustment
  if (normalizedColor.startsWith('rgb')) {
    // Extract RGB values and apply new alpha
    const match = normalizedColor.match(/\d+/g);
    if (match && match.length >= 3) {
      return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
    }
  }

  // Handle transparent
  if (normalizedColor === 'transparent') {
    return `rgba(0, 0, 0, 0)`;
  }

  // Convert hex to RGBA
  const cleanHex = normalizedColor.replace('#', '');

  // Handle 3-digit hex
  let hex = cleanHex;
  if (cleanHex.length === 3) {
    hex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return `rgba(156, 163, 175, ${alpha})`; // fallback
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Convert hex color to RGB values for inline styles
 * @param color - Hex color string, color name, or rgb string
 * @returns RGB object or null if invalid
 */
export function hexToRgb(color: string | undefined): { r: number; g: number; b: number } | null {
  if (!color) return null;

  // Normalize color first
  const normalizedColor = normalizeColor(color);

  // Handle rgb/rgba format
  if (normalizedColor.startsWith('rgb')) {
    const match = normalizedColor.match(/\d+/g);
    if (match && match.length >= 3) {
      return {
        r: parseInt(match[0]),
        g: parseInt(match[1]),
        b: parseInt(match[2]),
      };
    }
  }

  // Handle transparent
  if (normalizedColor === 'transparent') {
    return { r: 0, g: 0, b: 0 };
  }

  // Convert hex to RGB
  const cleanHex = normalizedColor.replace('#', '');

  // Handle 3-digit hex
  let hex = cleanHex;
  if (cleanHex.length === 3) {
    hex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }

  return { r, g, b };
}
