'use client';

/**
 * useSafeNavigation Hook
 *
 * A hook that provides safe navigation with:
 * - Immediate visual feedback (triggers skeleton via NavigationProgressContext)
 * - Duplicate click prevention
 * - Integration with Next.js router
 *
 * Usage:
 * ```tsx
 * const { navigate, isNavigating, isNavigatingTo } = useSafeNavigation();
 *
 * // Navigate safely (shows skeleton immediately, blocks duplicates)
 * navigate('/dashboard');
 *
 * // Check if currently navigating to a specific path
 * const isGoingToDashboard = isNavigatingTo('/dashboard');
 * ```
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationProgress } from '@/lib/context/navigation-progress-context';

interface UseSafeNavigationOptions {
  /**
   * Callback to run after starting navigation (e.g., close mobile drawer)
   */
  onNavigationStart?: () => void;
}

interface UseSafeNavigationReturn {
  /**
   * Navigate to a path with duplicate prevention and immediate skeleton trigger
   */
  navigate: (path: string) => void;

  /**
   * Navigate with replace instead of push
   */
  replace: (path: string) => void;

  /**
   * Whether any navigation is currently in progress
   */
  isNavigating: boolean;

  /**
   * The current navigation target path (if navigating)
   */
  targetPath: string | null;

  /**
   * Check if currently navigating to a specific path
   */
  isNavigatingTo: (path: string) => boolean;

  /**
   * Cancel the current navigation and reset state
   */
  cancelNavigation: () => void;
}

export function useSafeNavigation(
  options: UseSafeNavigationOptions = {}
): UseSafeNavigationReturn {
  const router = useRouter();
  const {
    isNavigating,
    targetPath,
    startNavigation,
    cancelNavigation,
    isNavigatingTo,
  } = useNavigationProgress();

  const { onNavigationStart } = options;

  const navigate = useCallback(
    (path: string) => {
      // Attempt to start navigation - returns false if duplicate
      const started = startNavigation(path);
      if (!started) {
        return;
      }

      // Call the onNavigationStart callback (e.g., close mobile drawer)
      onNavigationStart?.();

      // Perform the actual navigation
      router.push(path);
    },
    [router, startNavigation, onNavigationStart]
  );

  const replace = useCallback(
    (path: string) => {
      const started = startNavigation(path);
      if (!started) {
        return;
      }

      onNavigationStart?.();
      router.replace(path);
    },
    [router, startNavigation, onNavigationStart]
  );

  return {
    navigate,
    replace,
    isNavigating,
    targetPath,
    isNavigatingTo,
    cancelNavigation,
  };
}
