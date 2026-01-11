/**
 * Minimal client-side session provider wrapper.
 *
 * This is the ONLY client component that wraps the app. It provides:
 * - A tiny session context (user + refresh function)
 * - Theme provider (dark/light mode)
 * - Memoized context value (prevents unnecessary re-renders)
 *
 * The initial session is server-fetched and passed as a prop.
 * Client components use the useSession hook to access it.
 *
 * Key design:
 * - Minimal surface area
 * - Memoized value (useMemo prevents context thrashing)
 * - Focused on a single responsibility: app-wide providers
 */

'use client';

import React, { ReactNode, useMemo, useCallback, useState, useEffect } from 'react';
import type { User } from '@/lib/auth/check-token';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { setupFetchInterceptor } from '@/lib/api/fetch-interceptor';
import { SignalRProvider } from '@/lib/signalr/signalr-context';

/**
 * Session context shape.
 */
export interface SessionContextType {
  user: User | null;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  isMounted: boolean; // True after client-side hydration completes
}

/**
 * React Context for session information.
 *
 * Access via useSession() hook.
 */
export const SessionContext = React.createContext<SessionContextType | undefined>(
  undefined
);

/**
 * Props for ClientAppWrapper.
 */
interface ClientAppWrapperProps {
  /**
   * Server-fetched initial session (or null if not authenticated).
   */
  initialSession: User | null;

  /**
   * Child components to render.
   */
  children: ReactNode;
}

/**
 * Client-side wrapper that provides session and theme context.
 *
 * This component is the ONLY top-level client provider in the app.
 * It receives the initial session from the server and provides it
 * to child components via React Context.
 *
 * Design rationale:
 * - Runs on client only (marked 'use client')
 * - Receives server-fetched session as a prop (no client-side fetch on mount)
 * - Provides context for useSession() hook
 * - Provides theme context via next-themes
 * - Memoizes context value to prevent unnecessary re-renders
 * - Provides refresh() function for manual session revalidation
 *
 * @param props - Wrapper props
 * @returns JSX.Element - Provider-wrapped children
 */
export default function ClientAppWrapper({
  initialSession,
  children,
}: ClientAppWrapperProps) {
  // State for current user (starts with server session)
  const [user, setUser] = useState<User | null>(initialSession);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Track mount state to prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Setup global fetch interceptor on mount
  // This patches window.fetch to automatically handle 401/403 errors
  useEffect(() => {
    setupFetchInterceptor();
  }, []);

  // Refresh function: calls /api/auth/session to revalidate
  const refresh = useCallback(async () => {
    if (isRefreshing) return; // Prevent concurrent refreshes

    setIsRefreshing(true);
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
      });

      if (!response.ok) {
        // Session invalid, clear user
        setUser(null);
        return;
      }

      const data = await response.json();
      if (data.ok && data.user) {
        setUser(data.user);
      } else {
        // Session invalid, clear user
        setUser(null);
      }
    } catch (error) {
      console.error('Session refresh error:', error);
      // On network error, keep current user (optimistic)
      // They will be redirected on next protected page visit
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  // Memoize context value to prevent unnecessary re-renders
  // Only changes when user, refresh, or mounted state changes
  const contextValue = useMemo<SessionContextType>(
    () => ({
      user,
      refresh,
      isRefreshing,
      isMounted,
    }),
    [user, refresh, isRefreshing, isMounted]
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SessionContext.Provider value={contextValue}>
        {/* SignalR provider with lazy connection - only connects when first chat is opened */}
        <SignalRProvider>
          {children}
        </SignalRProvider>
        <Toaster position="top-right" richColors closeButton />
      </SessionContext.Provider>
    </ThemeProvider>
  );
}
