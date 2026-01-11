'use client';

/**
 * Connection Status Hook (SignalR)
 *
 * Provides progressive connection alerts based on SignalR state.
 * Implements grace periods to avoid false alerts during normal operations.
 */

import { useState, useEffect, useRef } from 'react';

export type ConnectionAlertLevel = 'none' | 'info' | 'warning' | 'error';

export interface UseConnectionStatusOptions {
  isConnected: boolean;
  gracePeriod?: number;      // ms before showing any alert (default: 5000)
  warningPeriod?: number;    // ms before showing warning (default: 15000)
  errorPeriod?: number;      // ms before showing error (default: 30000)
  initialLoadGrace?: number; // extra grace for initial page load (default: 8000)
}

export interface UseConnectionStatusResult {
  alertLevel: ConnectionAlertLevel;
}

export function useConnectionStatus({
  isConnected,
  gracePeriod = 5000,
  warningPeriod = 15000,
  errorPeriod = 30000,
  initialLoadGrace = 8000,
}: UseConnectionStatusOptions): UseConnectionStatusResult {
  const [alertLevel, setAlertLevel] = useState<ConnectionAlertLevel>('none');
  const disconnectTimeRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    // Handle initial load grace
    const initialGraceTimer = setTimeout(() => {
      isInitialLoadRef.current = false;
    }, initialLoadGrace);

    return () => clearTimeout(initialGraceTimer);
  }, [initialLoadGrace]);

  useEffect(() => {
    if (isConnected) {
      // Connected - clear everything
      disconnectTimeRef.current = null;
      setAlertLevel('none');
      return;
    }

    // Not connected - start tracking disconnect time
    if (disconnectTimeRef.current === null) {
      disconnectTimeRef.current = Date.now();
    }

    // During initial load, don't show alerts
    if (isInitialLoadRef.current) {
      return;
    }

    // Check alert level periodically
    const checkAlertLevel = () => {
      if (disconnectTimeRef.current === null) return;

      const disconnectDuration = Date.now() - disconnectTimeRef.current;

      if (disconnectDuration >= errorPeriod) {
        setAlertLevel('error');
      } else if (disconnectDuration >= warningPeriod) {
        setAlertLevel('warning');
      } else if (disconnectDuration >= gracePeriod) {
        setAlertLevel('info');
      } else {
        setAlertLevel('none');
      }
    };

    // Check immediately and then periodically
    checkAlertLevel();
    const interval = setInterval(checkAlertLevel, 1000);

    return () => clearInterval(interval);
  }, [isConnected, gracePeriod, warningPeriod, errorPeriod]);

  return { alertLevel };
}
