"use client";

import { AuthLayout } from "@/components/auth";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { adLogin } from "@/lib/api/auth.actions";
import {
  clearAllAuthData,
  isAuthenticated,
  setStoredAccessToken,
} from "@/lib/utils/auth-storage";
import { getSafeRedirectUrl } from "@/lib/utils/validate-redirect";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LoginForm, LoginHeader } from "./_components";

export default function CredentialsLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Get redirect URL from query params (validated to prevent open redirect attacks)
  const redirectUrl = getSafeRedirectUrl(searchParams.get('redirect'));

  // Check authentication and handle stale cookies
  useEffect(() => {
    // Clear any client-side auth data that might be stale
    // This ensures we start fresh on the login page
    if (typeof document !== "undefined") {
      // Check if we have cookies but they might be invalid
      const hasUserData = document.cookie.includes("user_data");
      const hasAccessToken = document.cookie.includes("access_token");

      // If we're on the login page, clear any existing client-side data
      // The server-side middleware/layout would have redirected us here if tokens are invalid
      if (hasUserData || hasAccessToken) {
        // Clear client-side cookies by setting them to expire
        document.cookie =
          "user_data=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        document.cookie =
          "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        document.cookie =
          "session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        document.cookie =
          "refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }

      // Clear localStorage as well
      clearAllAuthData();
    }

    // Check if user is authenticated after clearing stale data
    const authenticated = isAuthenticated();
    setIsCheckingAuth(false);

    if (authenticated) {
      router.replace(redirectUrl);
    }
  }, [router, redirectUrl]);

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      setError(null);

      if (!username || !password) {
        setError("Please fill in all fields");
        return;
      }

      setLoading(true);

      try {
        const result = await adLogin(username, password);

        if (!result.success || !result.data) {
          throw new Error(result.error || "Authentication failed");
        }

        const data = result.data;

        // NOTE: Backend sets httpOnly cookies (access_token, user_data, session_id)
        // BUT WebSocket connections need the access token in query params, so we MUST store it client-side
        // Store access token in localStorage for WebSocket use (httpOnly cookie can't be read by JS)
        if (data.access_token) {
          setStoredAccessToken(data.access_token, data.expires_in);
        }

        // Use window.location.href to ensure cookies are sent
        // Prioritize client-side redirect URL over backend redirect
        window.location.href = redirectUrl;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");
        setError(error.message || "Invalid username or password");
        // Only re-enable the button on error - keep it disabled on success
        // to prevent multiple clicks during redirect
        setLoading(false);
      }
    },
    [redirectUrl]
  );

  // Show loading state while checking authentication
  if (isCheckingAuth) {
    return (
      <AuthLayout>
        <Card className="w-full max-w-md mx-auto sm:mx-0">
          <CardContent className="flex items-center justify-center p-6 sm:p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm sm:text-base text-muted-foreground">Loading...</p>
            </div>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-md mx-auto sm:mx-0">
        <LoginHeader />
        <CardContent className="px-4 sm:px-6 py-4 sm:py-6">
          <LoginForm onSubmit={handleLogin} isLoading={loading} error={error} />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
