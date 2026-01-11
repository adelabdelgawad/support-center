'use client';

/**
 * Navigation Loading Overlay
 *
 * Shows a loading skeleton immediately when navigation starts,
 * providing instant visual feedback before the server renders the new page.
 *
 * This component should be placed in the layout to overlay the content area
 * during navigation transitions.
 *
 * Usage:
 * ```tsx
 * <NavigationLoadingOverlay>
 *   {children}
 * </NavigationLoadingOverlay>
 * ```
 */

import React from 'react';
import { useNavigationProgress } from '@/lib/context/navigation-progress-context';
import { PageSkeleton } from './page-skeleton';

interface NavigationLoadingOverlayProps {
  /**
   * The page content to render when not navigating
   */
  children: React.ReactNode;

  /**
   * Custom skeleton component to show during navigation
   * Defaults to PageSkeleton
   */
  skeleton?: React.ReactNode;

  /**
   * Whether to completely replace children with skeleton (true)
   * or overlay the skeleton on top of children (false)
   * @default true
   */
  replaceContent?: boolean;
}

export function NavigationLoadingOverlay({
  children,
  skeleton,
  replaceContent = true,
}: NavigationLoadingOverlayProps) {
  const { isNavigating } = useNavigationProgress();

  if (!isNavigating) {
    return <>{children}</>;
  }

  if (replaceContent) {
    return skeleton ?? <PageSkeleton />;
  }

  // Overlay mode - show skeleton on top of faded content
  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none transition-opacity duration-150">
        {children}
      </div>
      <div className="absolute inset-0">
        {skeleton ?? <PageSkeleton />}
      </div>
    </div>
  );
}
