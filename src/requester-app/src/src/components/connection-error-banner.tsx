/**
 * Connection Error Banner Component
 *
 * Displays a persistent banner when SignalR connection is lost.
 * Shows:
 * - Error message
 * - Countdown to next automatic retry
 * - Manual retry button
 *
 * Automatically disappears when connection is restored.
 */

import { Show, createMemo, useContext } from 'solid-js';
import { NotificationSignalRContext, SignalRState } from '@/signalr';
import { WifiOff, RefreshCw } from 'lucide-solid';

export function ConnectionErrorBanner() {
  // Access context directly to handle cases where provider might not be mounted yet
  const context = useContext(NotificationSignalRContext);

  // Guard: Don't render if context isn't available (during HMR or before provider mounts)
  if (!context) {
    return null;
  }

  const { state, error, retryInfo, forceReconnect } = context;

  // Determine if banner should be visible
  // Show when: DISCONNECTED and (has error OR has retry countdown running)
  const shouldShow = createMemo(() => {
    const currentState = state();
    const currentError = error();
    const info = retryInfo();

    // Only show for DISCONNECTED state with either error or active retry
    if (currentState !== SignalRState.DISCONNECTED) {
      return false;
    }

    // Show if there's an error or if retry is scheduled
    return currentError !== null || info.countdownSeconds > 0;
  });

  // Handle manual retry
  const handleRetry = () => {
    forceReconnect();
  };

  return (
    <Show when={shouldShow()}>
      <div class="fixed top-0 left-0 right-0 z-50 bg-warning/95 backdrop-blur-sm border-b border-warning-foreground/20 shadow-lg animate-in slide-in-from-top duration-300">
        <div class="container mx-auto px-4 py-3">
          <div class="flex items-center justify-between gap-4">
            {/* Left side: Icon and message */}
            <div class="flex items-center gap-3 min-w-0">
              <div class="flex-shrink-0 p-2 bg-warning-foreground/10 rounded-full">
                <WifiOff class="h-5 w-5 text-warning-foreground" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-warning-foreground">
                  Connection Lost
                </p>
                <p class="text-xs text-warning-foreground/80 truncate">
                  <Show
                    when={retryInfo().countdownSeconds > 0}
                    fallback="Attempting to reconnect..."
                  >
                    Retrying in {retryInfo().countdownSeconds}s...
                  </Show>
                </p>
              </div>
            </div>

            {/* Right side: Retry button */}
            <button
              onClick={handleRetry}
              class="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-warning-foreground text-warning hover:bg-warning-foreground/90 focus:outline-none focus:ring-2 focus:ring-warning-foreground focus:ring-offset-2 focus:ring-offset-warning transition-all duration-200 shadow-sm"
            >
              <RefreshCw class="h-4 w-4" />
              <span>Retry Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Spacer to prevent content from being hidden behind fixed banner */}
      <div class="h-16" />
    </Show>
  );
}

export default ConnectionErrorBanner;
