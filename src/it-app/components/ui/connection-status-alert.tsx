'use client';

/**
 * Connection Status Alert Component
 *
 * Displays progressive connection status alerts based on alert level:
 * - none: No alert shown
 * - info: Subtle "Reconnecting..." toast at bottom
 * - warning: Yellow banner "Connection lost"
 * - error: Red banner with refresh action
 *
 * Implements WhatsApp/Slack-inspired UX for connection status.
 */

import { Wifi, WifiOff, RefreshCw, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectionAlertLevel } from '@/lib/signalr/use-connection-status';

export interface ConnectionStatusAlertProps {
  /** Current alert level */
  alertLevel: ConnectionAlertLevel;
  /** Optional custom class name */
  className?: string;
  /** Callback when refresh button is clicked (error state) */
  onRefresh?: () => void;
}

export function ConnectionStatusAlert({
  alertLevel,
  className,
  onRefresh,
}: ConnectionStatusAlertProps) {
  // No alert for 'none' level
  if (alertLevel === 'none') {
    return null;
  }

  // INFO: Subtle reconnecting indicator (bottom toast style)
  if (alertLevel === 'info') {
    return (
      <div
        className={cn(
          'fixed bottom-5 left-1/2 -translate-x-1/2 z-50',
          'flex items-center gap-2 px-4 py-2',
          'bg-muted/95 text-muted-foreground',
          'rounded-full shadow-lg',
          'text-sm font-medium',
          'animate-in fade-in slide-in-from-bottom-2 duration-300',
          className
        )}
      >
        <Wifi className="h-4 w-4 animate-pulse" />
        <span>Reconnecting...</span>
      </div>
    );
  }

  // WARNING: Yellow banner
  if (alertLevel === 'warning') {
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-2 px-4 py-3',
          'bg-yellow-500/90 text-white',
          'text-sm font-medium',
          'animate-in fade-in slide-in-from-top-2 duration-300',
          className
        )}
      >
        <AlertTriangle className="h-4 w-4" />
        <span>Connection lost. Trying to reconnect...</span>
      </div>
    );
  }

  // ERROR: Red banner with action
  if (alertLevel === 'error') {
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-3 px-4 py-3',
          'bg-destructive text-destructive-foreground',
          'text-sm font-medium',
          'animate-in fade-in slide-in-from-top-2 duration-300',
          className
        )}
      >
        <XCircle className="h-4 w-4" />
        <span>Unable to connect to chat.</span>
        <button
          onClick={onRefresh ?? (() => window.location.reload())}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1',
            'bg-white/20 hover:bg-white/30',
            'rounded-md transition-colors',
            'text-sm font-medium'
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Page
        </button>
      </div>
    );
  }

  return null;
}

/**
 * Inline Connection Status Alert
 *
 * Non-fixed version that renders inline within the page layout.
 * Use this for alerts that should appear within a specific container.
 */
export function InlineConnectionStatusAlert({
  alertLevel,
  className,
  onRefresh,
}: ConnectionStatusAlertProps) {
  // No alert for 'none' level
  if (alertLevel === 'none') {
    return null;
  }

  // INFO: Subtle reconnecting indicator
  if (alertLevel === 'info') {
    return (
      <div
        className={cn(
          'mx-4 mt-2',
          'flex items-center gap-2 px-3 py-2',
          'bg-muted text-muted-foreground',
          'rounded-md',
          'text-sm',
          'animate-in fade-in duration-300',
          className
        )}
      >
        <Wifi className="h-4 w-4 animate-pulse" />
        <span>Reconnecting to chat...</span>
      </div>
    );
  }

  // WARNING: Yellow alert
  if (alertLevel === 'warning') {
    return (
      <div
        className={cn(
          'mx-4 mt-2',
          'flex items-center gap-2 px-3 py-2',
          'bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400',
          'rounded-md',
          'text-sm',
          'animate-in fade-in duration-300',
          className
        )}
      >
        <AlertTriangle className="h-4 w-4" />
        <span>Connection lost. Trying to reconnect...</span>
      </div>
    );
  }

  // ERROR: Red alert with action
  if (alertLevel === 'error') {
    return (
      <div
        className={cn(
          'mx-4 mt-2',
          'flex items-center justify-between gap-3 px-3 py-2',
          'bg-destructive/10 border border-destructive/30 text-destructive',
          'rounded-md',
          'text-sm',
          'animate-in fade-in duration-300',
          className
        )}
      >
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span>Unable to connect. Messages may not update in real-time.</span>
        </div>
        <button
          onClick={onRefresh ?? (() => window.location.reload())}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1',
            'bg-destructive/20 hover:bg-destructive/30',
            'rounded-md transition-colors',
            'text-xs font-medium'
          )}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
    );
  }

  return null;
}

export default ConnectionStatusAlert;
