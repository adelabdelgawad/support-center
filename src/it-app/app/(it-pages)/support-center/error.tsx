'use client';

import RouteErrorBoundary from '@/components/errors/route-error-boundary';

/**
 * Error boundary for support-center routes.
 *
 * Catches errors specifically in the support-center section.
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
