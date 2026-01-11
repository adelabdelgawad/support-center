'use client';

/**
 * Remote Mode Selector Component
 * NetSupport-style segmented toggle for View/Control modes
 *
 * Features:
 * - Compact segmented control
 * - Instant mode switching
 * - Professional toolbar appearance
 */

import { Eye, MousePointer2 } from 'lucide-react';
import { useRemoteAccess, type RemoteMode } from '../_context/remote-access-context';
import { cn } from '@/lib/utils';

interface RemoteModeSelectorProps {
  className?: string;
  disabled?: boolean;
}

export function RemoteModeSelector({ className, disabled }: RemoteModeSelectorProps) {
  const { remoteMode, setRemoteMode, connectionState, sessionId } = useRemoteAccess();

  const isDisabled = disabled || connectionState !== 'connected' || !sessionId;

  const handleModeChange = (mode: RemoteMode) => {
    if (isDisabled || mode === remoteMode) return;
    setRemoteMode(mode);
  };

  return (
    <div
      className={cn(
        'inline-flex rounded-md bg-gray-700/50 p-0.5',
        isDisabled && 'opacity-50',
        className
      )}
    >
      {/* View Mode */}
      <button
        type="button"
        onClick={() => handleModeChange('view')}
        disabled={isDisabled}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-all',
          'focus:outline-none focus:ring-1 focus:ring-blue-500/50',
          remoteMode === 'view'
            ? 'bg-gray-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        <span>View</span>
      </button>

      {/* Control Mode */}
      <button
        type="button"
        onClick={() => handleModeChange('control')}
        disabled={isDisabled}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-all',
          'focus:outline-none focus:ring-1 focus:ring-blue-500/50',
          remoteMode === 'control'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
        )}
      >
        <MousePointer2 className="h-3.5 w-3.5" />
        <span>Control</span>
      </button>
    </div>
  );
}
