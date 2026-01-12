'use client';

import RouteErrorBoundary from '@/components/errors/route-error-boundary';

/**
 * Error boundary for requests list page.
 *
 * Catches errors in the requests list view.
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
