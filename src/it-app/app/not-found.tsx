'use client';

import { useRouter } from 'next/navigation';
import { FileQuestion, Home, ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Not Found Page (404)
 *
 * Global 404 page for Next.js app directory.
 * Displays when:
 * - Route doesn't exist
 * - Resource ID not found
 * - Page has been moved or deleted
 *
 * Uses shadcn/ui components for consistent styling.
 */
export default function NotFoundPage() {
  const router = useRouter();

  const handleGoHome = () => {
    router.push('/');
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleSearch = () => {
    // TODO: Implement search functionality
    // For now, redirect to home
    router.push('/');
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-lg border-amber-200 dark:border-amber-900">
        {/* Icon Header */}
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-6">
              <FileQuestion className="w-16 h-16 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold text-amber-700 dark:text-amber-400">
            Page Not Found
          </CardTitle>
          <CardDescription className="text-lg">
            We couldn&apos;t find the page you&apos;re looking for
          </CardDescription>
        </CardHeader>

        {/* Error Details */}
        <CardContent className="space-y-4">
          <Alert className="border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
            <FileQuestion className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-900 dark:text-amber-300">
              Error 404 - Not Found
            </AlertTitle>
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-400">
              The page you requested does not exist or has been moved.
            </AlertDescription>
          </Alert>

          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-foreground mb-2">
              This could have happened because:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>The URL was typed incorrectly</li>
              <li>The page has been moved or deleted</li>
              <li>The link you followed is outdated or broken</li>
              <li>You don&apos;t have permission to access this resource</li>
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <p className="text-sm text-blue-900 dark:text-blue-300">
              <strong>Looking for something specific?</strong> Try using the search
              feature or navigate back to the home page to find what you need.
            </p>
          </div>
        </CardContent>

        {/* Action Buttons */}
        <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6">
          <Button
            onClick={handleGoBack}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>

          <Button
            onClick={handleGoHome}
            variant="default"
            className="w-full sm:w-auto"
          >
            <Home className="mr-2 h-4 w-4" />
            Go to Home
          </Button>

          <Button
            onClick={handleSearch}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
