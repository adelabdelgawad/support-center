'use client';

/**
 * Navigation Progress Context
 *
 * Provides global state for tracking navigation progress across the application.
 * Enables immediate visual feedback (skeleton) when navigation is triggered,
 * and prevents duplicate navigation requests from rapid clicks.
 *
 * Key features:
 * - Tracks navigation state globally (isNavigating, targetPath)
 * - Resets state when navigation completes (via pathname change)
 * - Exposes utilities for safe navigation (startNavigation, cancelNavigation)
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { usePathname } from 'next/navigation';

interface NavigationProgressContextType {
  /**
   * Whether navigation is currently in progress
   */
  isNavigating: boolean;

  /**
   * The target path being navigated to (if any)
   */
  targetPath: string | null;

  /**
   * Start navigation to a target path.
   * Returns false if navigation is already in progress to the same path.
   */
  startNavigation: (path: string) => boolean;

  /**
   * Cancel the current navigation (e.g., on error)
   */
  cancelNavigation: () => void;

  /**
   * Check if the given path is the current navigation target
   */
  isNavigatingTo: (path: string) => boolean;
}

const NavigationProgressContext = createContext<NavigationProgressContextType | undefined>(
  undefined
);

interface NavigationProgressProviderProps {
  children: React.ReactNode;
}

export function NavigationProgressProvider({ children }: NavigationProgressProviderProps) {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const [targetPath, setTargetPath] = useState<string | null>(null);

  // Keep track of the previous pathname to detect navigation completion
  const prevPathnameRef = useRef(pathname);

  // Reset navigation state when the pathname changes (navigation completed)
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      // Navigation completed - reset state
      setIsNavigating(false);
      setTargetPath(null);
      prevPathnameRef.current = pathname;
    }
  }, [pathname]);

  // Safety timeout to reset navigation state if it gets stuck
  useEffect(() => {
    if (!isNavigating) return;

    const timeout = setTimeout(() => {
      // If still navigating after 10 seconds, reset (something went wrong)
      setIsNavigating(false);
      setTargetPath(null);
    }, 10000);

    return () => clearTimeout(timeout);
  }, [isNavigating]);

  const startNavigation = useCallback((path: string): boolean => {
    // Normalize the path
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    // If already navigating to the same path, block duplicate
    if (isNavigating && targetPath === normalizedPath) {
      return false;
    }

    // If navigating to current path, don't show loading
    if (pathname === normalizedPath) {
      return false;
    }

    setIsNavigating(true);
    setTargetPath(normalizedPath);
    return true;
  }, [isNavigating, targetPath, pathname]);

  const cancelNavigation = useCallback(() => {
    setIsNavigating(false);
    setTargetPath(null);
  }, []);

  const isNavigatingTo = useCallback(
    (path: string): boolean => {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      return isNavigating && targetPath === normalizedPath;
    },
    [isNavigating, targetPath]
  );

  const contextValue = useMemo<NavigationProgressContextType>(
    () => ({
      isNavigating,
      targetPath,
      startNavigation,
      cancelNavigation,
      isNavigatingTo,
    }),
    [isNavigating, targetPath, startNavigation, cancelNavigation, isNavigatingTo]
  );

  return (
    <NavigationProgressContext.Provider value={contextValue}>
      {children}
    </NavigationProgressContext.Provider>
  );
}

/**
 * Hook to access navigation progress context
 */
export function useNavigationProgress(): NavigationProgressContextType {
  const context = useContext(NavigationProgressContext);
  if (!context) {
    throw new Error(
      'useNavigationProgress must be used within a NavigationProgressProvider'
    );
  }
  return context;
}

/**
 * Hook to check if navigation progress context is available
 */
export function useNavigationProgressOptional(): NavigationProgressContextType | null {
  return useContext(NavigationProgressContext) ?? null;
}
