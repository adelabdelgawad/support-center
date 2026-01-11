'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight } from 'lucide-react';

/**
 * Authorization Error Page
 *
 * Displayed when a non-technician user attempts to access the agent portal
 * Provides clear messaging about insufficient privileges and redirects to home
 */

interface UnauthorizedPageProps {
  searchParams: {
    returnUrl?: string;
    reason?: string;
  };
}

export default function UnauthorizedPage({ searchParams }: UnauthorizedPageProps) {
  const router = useRouter();
  const [redirectCountdown, setRedirectCountdown] = React.useState(5);
  const reason = searchParams.reason || 'insufficient_privileges';

  // Auto-redirect after countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  const handleHomeClick = () => {
    router.push('/');
  };

  // Determine error message based on reason
  const getErrorMessage = () => {
    switch (reason) {
      case 'not_technician':
        return 'You do not have technician privileges required to access the agent portal.';
      case 'session_expired':
        return 'Your session has expired or is no longer valid.';
      case 'inactive_user':
        return 'Your account is inactive. Please contact your administrator.';
      case 'insufficient_privileges':
      default:
        return 'You do not have permission to access the agent portal.';
    }
  };

  const getDetailedMessage = () => {
    switch (reason) {
      case 'not_technician':
        return 'Only technician users can access the agent portal. If you believe this is an error, please contact your administrator.';
      case 'session_expired':
        return 'Please log in again to continue.';
      case 'inactive_user':
        return 'Your account has been marked as inactive. Contact your administrator to restore access.';
      case 'insufficient_privileges':
      default:
        return 'If you believe this is an error, please contact your administrator or try logging in again.';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        {/* Error Card */}
        <div className="bg-white rounded-lg shadow-lg p-8 border-t-4 border-red-500">
          {/* Error Icon */}
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 rounded-full p-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>

          {/* Error Message */}
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-center text-gray-600 mb-4">
            {getErrorMessage()}
          </p>

          {/* Detailed Message */}
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-sm text-red-700">
              {getDetailedMessage()}
            </p>
          </div>

          {/* Redirect Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <p className="text-sm text-blue-700">
              <span className="font-semibold">Redirecting in {redirectCountdown}s...</span>
            </p>
            <p className="text-xs text-blue-600 mt-2">
              You will be taken to the home page automatically.
            </p>
          </div>

          {/* Action Button */}
          <button
            onClick={handleHomeClick}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <span>Return to Home</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Support Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            Need help?{' '}
            <Link
              href="/"
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Contact Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
