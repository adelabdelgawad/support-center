'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Standard error boundary component for Next.js routes.
 *
 * Usage: Place in error.tsx files in route segments to catch errors
 * and prevent full-page crashes.
 */
export function RouteErrorBoundary({ error, reset }: RouteErrorBoundaryProps) {
  useEffect(() => {
    // Log error to console (could also send to error tracking service)
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-background">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-destructive/10">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-muted-foreground">
            {error.message || 'An unexpected error occurred while loading this page.'}
          </p>
        </div>

        {/* Error Details (in development) */}
        {process.env.NODE_ENV === 'development' && error.digest && (
          <div className="p-4 rounded-lg bg-muted text-sm text-left">
            <p className="font-mono text-xs text-muted-foreground">
              Error ID: {error.digest}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button
            onClick={() => window.location.href = '/support-center/requests'}
            variant="outline"
          >
            Go to requests
          </Button>
        </div>
      </div>
    </div>
  );
}

export default RouteErrorBoundary;
