'use client';

import { cn } from '@/lib/utils';

interface UnsavedChangesWarningProps {
  show: boolean;
  message?: string;
  className?: string;
}

export function UnsavedChangesWarning({
  show,
  message = 'You have unsaved changes',
  className,
}: UnsavedChangesWarningProps) {
  if (!show) return null;

  return (
    <div
      className={cn(
        'rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3',
        className
      )}
    >
      <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">
        {message}
      </p>
    </div>
  );
}
