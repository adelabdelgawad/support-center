'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert, Home, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Not Authorized Page (403 Forbidden)
 *
 * Displays when user tries to access a resource without sufficient permissions.
 * Uses shadcn/ui components for consistent styling.
 */
export default function NotAuthorizedPage() {
  const router = useRouter();

  const handleGoHome = () => {
    router.push('/');
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleRequestAccess = () => {
    // TODO: Implement request access functionality
    // For now, just go to support/contact page
    router.push('/support');
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-lg border-red-200 dark:border-red-900">
        {/* Icon Header */}
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-6">
              <ShieldAlert className="w-16 h-16 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold text-red-700 dark:text-red-400">
            Access Denied
          </CardTitle>
          <CardDescription className="text-lg">
            You don&apos;t have permission to access this page
          </CardDescription>
        </CardHeader>

        {/* Error Details */}
        <CardContent className="space-y-4">
          <Alert variant="destructive" className="border-red-300 dark:border-red-800">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Authorization Required</AlertTitle>
            <AlertDescription className="text-sm">
              You do not have the necessary permissions to view this resource.
              This could be because:
            </AlertDescription>
          </Alert>

          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 space-y-2">
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>Your user account doesn&apos;t have the required role</li>
              <li>This page is restricted to certain user groups</li>
              <li>Your access permissions have changed recently</li>
              <li>You need to request access from an administrator</li>
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <p className="text-sm text-blue-900 dark:text-blue-300">
              <strong>Need access?</strong> Contact your system administrator or use the
              &quot;Request Access&quot; button below to submit a formal access request.
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
            onClick={handleRequestAccess}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            <Mail className="mr-2 h-4 w-4" />
            Request Access
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
