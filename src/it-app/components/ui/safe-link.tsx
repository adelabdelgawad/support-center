'use client';

/**
 * SafeLink Component
 *
 * A wrapper around Next.js Link that provides:
 * - Immediate visual feedback when clicked (triggers skeleton via context)
 * - Duplicate click prevention during navigation
 * - Full compatibility with Next.js Link props
 * - Accessibility support (keyboard navigation, focus states)
 *
 * Usage:
 * ```tsx
 * <SafeLink href="/dashboard">Dashboard</SafeLink>
 *
 * // With disabled state during navigation
 * <SafeLink href="/settings" showLoadingState>Settings</SafeLink>
 * ```
 */

import React, { useCallback, forwardRef } from 'react';
import Link, { LinkProps } from 'next/link';
import { useNavigationProgress, useNavigationProgressOptional } from '@/lib/context/navigation-progress-context';
import { cn } from '@/lib/utils';

interface SafeLinkProps extends Omit<LinkProps, 'onClick'> {
  /**
   * Children to render inside the link
   */
  children: React.ReactNode;

  /**
   * Additional className for styling
   */
  className?: string;

  /**
   * Custom onClick handler (called before navigation starts)
   * Return false to prevent navigation
   */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => boolean | void;

  /**
   * Whether to show loading state on the link itself during navigation
   * @default false
   */
  showLoadingState?: boolean;

  /**
   * Custom className to apply when navigating to this link's target
   */
  loadingClassName?: string;

  /**
   * Whether to disable pointer events during navigation (to prevent hover states)
   * @default true
   */
  disableWhileNavigating?: boolean;
}

export const SafeLink = forwardRef<HTMLAnchorElement, SafeLinkProps>(
  function SafeLink(
    {
      href,
      children,
      className,
      onClick,
      showLoadingState = false,
      loadingClassName = 'opacity-70 cursor-wait',
      disableWhileNavigating = true,
      ...props
    },
    ref
  ) {
    // Use optional context to gracefully handle being outside provider
    const navigationContext = useNavigationProgressOptional();

    // Extract string path from href (can be string or UrlObject)
    const hrefString = typeof href === 'string'
      ? href
      : (href as { pathname?: string })?.pathname ?? '';
    const isNavigatingToThis = navigationContext?.isNavigatingTo(hrefString) ?? false;

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        // Call custom onClick first
        if (onClick) {
          const result = onClick(e);
          // If onClick returns false, prevent navigation
          if (result === false) {
            e.preventDefault();
            return;
          }
        }

        // If already navigating to this path, prevent duplicate
        if (isNavigatingToThis) {
          e.preventDefault();
          return;
        }

        // Start navigation tracking (if context is available)
        if (navigationContext) {
          const started = navigationContext.startNavigation(hrefString);
          if (!started) {
            // Navigation was blocked (duplicate or same path)
            e.preventDefault();
            return;
          }
        }

        // Let the Link component handle the actual navigation
      },
      [onClick, isNavigatingToThis, navigationContext, hrefString]
    );

    const computedClassName = cn(
      className,
      showLoadingState && isNavigatingToThis && loadingClassName,
      disableWhileNavigating && isNavigatingToThis && 'pointer-events-none'
    );

    return (
      <Link
        ref={ref}
        href={href}
        className={computedClassName}
        onClick={handleClick}
        aria-busy={isNavigatingToThis}
        {...props}
      >
        {children}
      </Link>
    );
  }
);

/**
 * SafeNavButton Component
 *
 * A button that navigates using the safe navigation hook.
 * Use this when you need button semantics instead of link semantics.
 *
 * Usage:
 * ```tsx
 * <SafeNavButton href="/dashboard">Dashboard</SafeNavButton>
 * ```
 */
interface SafeNavButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * The path to navigate to
   */
  href: string;

  /**
   * Whether to use replace instead of push
   */
  replace?: boolean;

  /**
   * Custom className to apply when navigating to this button's target
   */
  loadingClassName?: string;

  /**
   * Callback to run after starting navigation
   */
  onNavigationStart?: () => void;
}

export const SafeNavButton = forwardRef<HTMLButtonElement, SafeNavButtonProps>(
  function SafeNavButton(
    {
      href,
      replace = false,
      children,
      className,
      loadingClassName = 'opacity-70 cursor-wait',
      onNavigationStart,
      disabled,
      onClick,
      ...props
    },
    ref
  ) {
    const navigationContext = useNavigationProgressOptional();
    const isNavigatingToThis = navigationContext?.isNavigatingTo(href) ?? false;

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        // Call custom onClick first
        onClick?.(e);

        if (e.defaultPrevented) {
          return;
        }

        // If already navigating to this path, prevent duplicate
        if (isNavigatingToThis || disabled) {
          return;
        }

        // Start navigation tracking
        if (navigationContext) {
          const started = navigationContext.startNavigation(href);
          if (!started) {
            return;
          }
        }

        // Call onNavigationStart callback
        onNavigationStart?.();

        // Note: The actual navigation must be handled by the parent component
        // or by wrapping this with a router.push call
      },
      [onClick, isNavigatingToThis, disabled, navigationContext, href, onNavigationStart]
    );

    const computedClassName = cn(
      className,
      isNavigatingToThis && loadingClassName,
      isNavigatingToThis && 'pointer-events-none'
    );

    return (
      <button
        ref={ref}
        type="button"
        className={computedClassName}
        onClick={handleClick}
        disabled={disabled || isNavigatingToThis}
        aria-busy={isNavigatingToThis}
        {...props}
      >
        {children}
      </button>
    );
  }
);
