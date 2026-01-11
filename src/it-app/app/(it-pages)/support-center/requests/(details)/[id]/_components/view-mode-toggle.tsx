'use client';

/**
 * View Mode Toggle Component
 * Switches between Chat and Remote Access views
 *
 * Only visible when a remote session is active
 * Allows switching without disrupting the session
 */

import { MessageSquare, Monitor, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRemoteAccess } from '../_context/remote-access-context';
import { cn } from '@/lib/utils';

interface ViewModeToggleProps {
  className?: string;
}

export function ViewModeToggle({ className }: ViewModeToggleProps) {
  const {
    sessionStatus,
    viewMode,
    setViewMode,
    endSession,
    connectionState,
  } = useRemoteAccess();

  // Only show when session is active
  if (sessionStatus !== 'active') {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-1 bg-muted p-1 rounded-lg', className)}>
      {/* Chat Button */}
      <Button
        variant={viewMode === 'chat' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setViewMode('chat')}
        className={cn(
          'gap-2 h-8',
          viewMode === 'chat'
            ? 'bg-background shadow-sm'
            : 'hover:bg-background/50'
        )}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Chat</span>
      </Button>

      {/* Remote Access Button with close */}
      <div className="flex items-center">
        <Button
          variant={viewMode === 'remote' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('remote')}
          className={cn(
            'gap-2 h-8 rounded-r-none',
            viewMode === 'remote'
              ? 'bg-background shadow-sm'
              : 'hover:bg-background/50'
          )}
        >
          <Monitor className="h-4 w-4" />
          <span className="hidden sm:inline">Remote</span>
          {/* Connection indicator */}
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              connectionState === 'connected'
                ? 'bg-green-500'
                : connectionState === 'connecting' || connectionState === 'reconnecting'
                ? 'bg-yellow-500 animate-pulse'
                : 'bg-red-500'
            )}
          />
        </Button>

        {/* Close Remote Session Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => endSession('agent_ended')}
          className={cn(
            'h-8 px-2 rounded-l-none border-l',
            viewMode === 'remote'
              ? 'bg-background hover:bg-red-100 dark:hover:bg-red-900/30'
              : 'hover:bg-red-100 dark:hover:bg-red-900/30'
          )}
          title="End Remote Session"
        >
          <X className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    </div>
  );
}
