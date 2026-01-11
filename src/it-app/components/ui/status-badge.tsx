/**
 * Status Badge Component
 *
 * Displays ticket status as a styled badge.
 * Automatically maps statusId to label and color from theme-aware tokens.
 *
 * Features:
 * - Pure presentation component
 * - Theme-aware colors
 * - Consistent styling across app
 * - No business logic
 *
 * Usage:
 *   <StatusBadge status={ticket.status} />
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface StatusInfo {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  color: string | null;
}

interface StatusBadgeProps {
  status: StatusInfo;
  className?: string;
  variant?: 'default' | 'outline';
}

/**
 * Default/fallback status used when no status is available.
 * Reusable across the app.
 */
export const DEFAULT_STATUS: StatusInfo = {
  id: 0,
  name: 'Pending',
  nameEn: 'Pending',
  nameAr: 'قيد الانتظار',
  color: null,
};

/**
 * Get semantic color class based on status properties
 */
function getStatusColorClass(status: StatusInfo): string {
  // If status has a custom color, use inline style instead
  if (status.color) {
    return '';
  }

  // Fallback semantic colors
  const name = status.name.toLowerCase();
  if (name.includes('new') || name.includes('open')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  if (name.includes('progress') || name.includes('assigned')) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }
  if (name.includes('pending') || name.includes('waiting')) {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  }
  if (name.includes('solved') || name.includes('resolved') || name.includes('closed')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (name.includes('cancelled') || name.includes('rejected')) {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }

  // Default neutral
  return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
}

export function StatusBadge({
  status,
  className,
  variant = 'default',
}: StatusBadgeProps) {
  const colorClass = getStatusColorClass(status);

  // If status has a custom color, use inline style
  const customStyle = status.color
    ? {
        backgroundColor: `${status.color}20`, // 20% opacity for background
        color: status.color,
        borderColor: status.color,
      }
    : undefined;

  return (
    <Badge
      variant={variant}
      className={cn(
        'font-medium text-xs px-2 py-0.5',
        !status.color && colorClass,
        className
      )}
      style={customStyle}
    >
      {status.name}
    </Badge>
  );
}
