'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusVariant = 'default' | 'success' | 'error' | 'loading';

interface StatusIconProps {
  icon: LucideIcon;
  variant?: StatusVariant;
  className?: string;
}

const variantStyles: Record<StatusVariant, { bg: string; icon: string }> = {
  default: {
    bg: 'bg-primary/15',
    icon: 'text-primary',
  },
  success: {
    bg: 'bg-green-500/15',
    icon: 'text-green-500',
  },
  error: {
    bg: 'bg-destructive/15',
    icon: 'text-destructive',
  },
  loading: {
    bg: 'bg-primary/15',
    icon: 'text-primary',
  },
};

export function StatusIcon({
  icon: Icon,
  variant = 'default',
  className,
}: StatusIconProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        'w-16 h-16 rounded-full flex items-center justify-center',
        styles.bg,
        className
      )}
    >
      <Icon
        className={cn(
          'w-8 h-8',
          styles.icon,
          variant === 'loading' && 'animate-spin'
        )}
      />
    </div>
  );
}
