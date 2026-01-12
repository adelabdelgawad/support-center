'use client';

import RouteErrorBoundary from '@/components/errors/route-error-boundary';

/**
 * Error boundary for request detail page.
 *
 * Catches errors in the request detail view (critical page).
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
