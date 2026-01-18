'use client';

/**
 * Navigation Provider
 *
 * HYDRATION FIX: Adopts network_manager's server-first pattern
 * - Server provides initial data via props
 * - No immediate fetch on mount when server data is available
 * - Clear hydration boundary with isHydrated flag
 *
 * Wraps the navigation components with data fetching.
 * Renders immediately with server-provided navigation, fetches fresh data in background.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useNavigation } from '@/lib/hooks/use-navigation';
import type { Page } from '@/types/pages';

interface NavigationContextType {
  pages: Page[];
  isLoading: boolean;
  isValidating: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  isHydrated: boolean;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

interface NavigationProviderProps {
  /**
   * User ID for fetching navigation (from cookie/session)
   */
  userId: string | null;

  /**
   * Initial pages from server (optional, for hydration)
   */
  initialPages?: Page[];

  /**
   * Server pathname (for hydration-safe active state)
   */
  serverPathname?: string;

  /**
   * Children to render
   */
  children: React.ReactNode;
}

/**
 * Provides navigation context with server-first fetching
 */
export function NavigationProvider({
  userId,
  initialPages,
  serverPathname,
  children,
}: NavigationProviderProps) {
  const { pages, isLoading, isValidating, error, refresh, isHydrated } = useNavigation(userId, {
    initialPages,
    serverPathname,
  });

  const contextValue = useMemo<NavigationContextType>(
    () => ({
      pages,
      isLoading,
      isValidating,
      error,
      refresh,
      isHydrated,
    }),
    [pages, isLoading, isValidating, error, refresh, isHydrated]
  );

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
}

/**
 * Hook to access navigation context
 */
export function useNavigationContext(): NavigationContextType {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigationContext must be used within a NavigationProvider');
  }
  return context;
}

/**
 * Navigation data consumer component
 * Renders children with navigation data injected
 */
interface NavigationDataProps {
  children: (data: {
    pages: Page[];
    isLoading: boolean;
    isValidating: boolean;
    isHydrated: boolean;
  }) => React.ReactNode;
}

export function NavigationData({ children }: NavigationDataProps) {
  const { pages, isLoading, isValidating, isHydrated } = useNavigationContext();
  return <>{children({ pages, isLoading, isValidating, isHydrated })}</>;
}
