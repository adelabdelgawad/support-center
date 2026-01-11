'use client';

/**
 * Navigation Provider
 *
 * Wraps the navigation components with SWR-based data fetching.
 * Renders immediately with cached navigation, fetches fresh data in background.
 *
 * This is the key component for instant layout rendering:
 * - On first render: uses cached navigation from localStorage (instant)
 * - Background: fetches fresh navigation via SWR
 * - On success: updates cache and re-renders with fresh data
 * - On auth error: allows normal error handling (redirect to login)
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
   * Children to render
   */
  children: React.ReactNode;
}

/**
 * Provides navigation context with SWR-based fetching and caching
 */
export function NavigationProvider({
  userId,
  initialPages,
  children,
}: NavigationProviderProps) {
  const { pages, isLoading, isValidating, error, refresh } = useNavigation(userId, {
    initialPages,
  });

  const contextValue = useMemo<NavigationContextType>(
    () => ({
      pages,
      isLoading,
      isValidating,
      error,
      refresh,
    }),
    [pages, isLoading, isValidating, error, refresh]
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
  }) => React.ReactNode;
}

export function NavigationData({ children }: NavigationDataProps) {
  const { pages, isLoading, isValidating } = useNavigationContext();
  return <>{children({ pages, isLoading, isValidating })}</>;
}
