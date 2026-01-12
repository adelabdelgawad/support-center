'use client';

import RouteErrorBoundary from '@/components/errors/route-error-boundary';

/**
 * Error boundary for authenticated routes.
 *
 * Catches errors in all (it-pages) routes including:
 * - /support-center/*
 * - /reports/*
 * - /setting/*
 * - /management/*
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorBoundary error={error} reset={reset} />;
}
