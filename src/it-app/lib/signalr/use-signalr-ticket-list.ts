/**
 * Hook for subscribing to user's ticket list real-time updates.
 *
 * This hook subscribes to the TicketHub to receive updates when tickets
 * the user is involved with (as requester or assignee) change. This enables
 * real-time updates on the tickets list page without relying solely on polling.
 *
 * Usage:
 * ```tsx
 * const { isSubscribed } = useSignalRTicketList({
 *   onTicketUpdated: (data) => {
 *     // Trigger SWR refresh
 *     refresh();
 *   },
 *   enabled: true,
 * });
 * ```
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { signalRTicket } from './signalr-manager';
import type { TicketListUpdateEvent } from './types';

export interface UseSignalRTicketListOptions {
  /** Callback when a ticket in the user's list is updated */
  onTicketUpdated?: (data: TicketListUpdateEvent) => void;
  /** Whether to enable the subscription (default: true) */
  enabled?: boolean;
}

export interface UseSignalRTicketListResult {
  /** Whether currently subscribed to ticket list updates */
  isSubscribed: boolean;
}

export function useSignalRTicketList(
  options: UseSignalRTicketListOptions = {}
): UseSignalRTicketListResult {
  const { onTicketUpdated, enabled = true } = options;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const subscriptionIdRef = useRef<string | null>(null);
  const onTicketUpdatedRef = useRef(onTicketUpdated);

  // Keep callback ref current
  useEffect(() => {
    onTicketUpdatedRef.current = onTicketUpdated;
  }, [onTicketUpdated]);

  // Handler that calls the current callback ref
  const handleTicketListUpdated = useCallback((data: TicketListUpdateEvent) => {
    console.log('[useSignalRTicketList] Ticket list updated:', data);
    onTicketUpdatedRef.current?.(data);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Cleanup if disabled
      if (subscriptionIdRef.current) {
        signalRTicket.unsubscribeFromUserTicketList(subscriptionIdRef.current);
        subscriptionIdRef.current = null;
        setIsSubscribed(false);
      }
      return;
    }

    let mounted = true;

    const subscribe = async () => {
      try {
        const subscriptionId = await signalRTicket.subscribeToUserTicketList({
          onTicketListUpdated: handleTicketListUpdated,
        });

        if (mounted) {
          subscriptionIdRef.current = subscriptionId;
          setIsSubscribed(true);
          console.log('[useSignalRTicketList] Subscribed with ID:', subscriptionId);
        } else {
          // Component unmounted during subscription, cleanup
          signalRTicket.unsubscribeFromUserTicketList(subscriptionId);
        }
      } catch (error) {
        console.error('[useSignalRTicketList] Failed to subscribe:', error);
        if (mounted) {
          setIsSubscribed(false);
        }
      }
    };

    subscribe();

    return () => {
      mounted = false;
      if (subscriptionIdRef.current) {
        signalRTicket.unsubscribeFromUserTicketList(subscriptionIdRef.current);
        subscriptionIdRef.current = null;
        setIsSubscribed(false);
        console.log('[useSignalRTicketList] Unsubscribed');
      }
    };
  }, [enabled, handleTicketListUpdated]);

  return { isSubscribed };
}
