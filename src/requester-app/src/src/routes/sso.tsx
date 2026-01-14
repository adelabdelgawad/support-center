/**
 * SSO Route - Single Sign-On page using Windows session
 *
 * This page is the primary authentication method for Tauri desktop.
 * It automatically:
 * 1. Detects the Windows session username
 * 2. Automatically attempts SSO login with that username (no user interaction required)
 * 3. Redirects to saved path (or /tickets) on success
 * 4. Falls back to manual SSO button if auto-login fails
 */

// Session storage key for preserving route across SSO redirect (shared with App.tsx)
const REDIRECT_PATH_KEY = "auth_redirect_path";

import { useNavigate, A } from "@solidjs/router";
import { createSignal, createEffect, onMount, Show } from "solid-js";
import { authStore, useIsAuthenticated, useAuthLoading, useAuthError, useSystemUsername, useIsTauriEnv, useAutoLoginAttempted, useAutoLoginInProgress, useExplicitLogout } from "@/stores";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { User, Shield, AlertCircle, RefreshCw } from "lucide-solid";

/**
 * Check if running in Tauri - inline version to avoid import issues
 */
function checkIsTauri(): boolean {
  if (typeof window === "undefined") {
    console.log("checkIsTauri: window is undefined");
    return false;
  }

  // Check for Tauri v2 (preferred)
  if ("__TAURI_INTERNALS__" in window) {
    console.log("checkIsTauri: Found __TAURI_INTERNALS__");
    return true;
  }

  // Check for Tauri v1 (fallback)
  if ("__TAURI__" in window) {
    console.log("checkIsTauri: Found __TAURI__");
    return true;
  }

  // Check for Tauri IPC
  if ("__TAURI_IPC__" in window) {
    console.log("checkIsTauri: Found __TAURI_IPC__");
    return true;
  }

  console.log("checkIsTauri: No Tauri markers found in window");
  return false;
}

export default function SSOPage() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const authError = useAuthError();
  const systemUsername = useSystemUsername();
  const isTauriEnv = useIsTauriEnv(); // Use global store state
  const autoLoginAttempted = useAutoLoginAttempted();
  const autoLoginInProgress = useAutoLoginInProgress();
  const explicitLogout = useExplicitLogout();

  const [isManualLoggingIn, setIsManualLoggingIn] = createSignal(false);

  // INSTANT STARTUP: isTauriEnv is now set synchronously at store creation
  // Just trigger the auto-login flow if in Tauri and not authenticated
  onMount(() => {
    // Check auth state immediately - if authenticated, skip all detection
    // App.tsx will handle the redirect to /tickets
    if (authStore.state.isAuthenticated) {
      console.log("[SSO] Already authenticated, skipping");
      return;
    }

    // Trigger auto-login flow (non-blocking)
    console.log("[SSO] Initiating auto-login flow");
    authStore.detectTauriEnvironment();
  });

  // Redirect if already authenticated
  // Access store directly to ensure proper SolidJS reactivity tracking
  createEffect(() => {
    const isAuth = authStore.state.isAuthenticated;
    console.log("SSO: createEffect - isAuthenticated:", isAuth);
    if (isAuth) {
      // Check for saved redirect path
      let redirectTo = "/tickets";
      try {
        const savedPath = sessionStorage.getItem(REDIRECT_PATH_KEY);
        if (savedPath) {
          redirectTo = savedPath;
          sessionStorage.removeItem(REDIRECT_PATH_KEY);
          console.log("SSO: Restoring saved redirect path:", redirectTo);
        }
      } catch {
        // sessionStorage might not be available
      }
      console.log(`SSO: Redirecting to ${redirectTo}`);
      navigate(redirectTo, { replace: true });
    }
  });

  // Handle manual SSO login (fallback when auto-login fails)
  const handleManualSSOLogin = async () => {
    if (!isTauriEnv()) {
      return;
    }

    authStore.clearError();
    setIsManualLoggingIn(true);

    const success = await authStore.loginSSO(false); // Manual login, not auto

    setIsManualLoggingIn(false);

    if (success) {
      // Check for saved redirect path
      let redirectTo = "/tickets";
      try {
        const savedPath = sessionStorage.getItem(REDIRECT_PATH_KEY);
        if (savedPath) {
          redirectTo = savedPath;
          sessionStorage.removeItem(REDIRECT_PATH_KEY);
          console.log("SSO: Manual login - restoring saved path:", redirectTo);
        }
      } catch {
        // sessionStorage might not be available
      }
      navigate(redirectTo, { replace: true });
    }
  };

  // Show loading state when auto-login is in progress or manual login is happening
  const showLoading = () => isLoading() || isManualLoggingIn() || autoLoginInProgress();

  // Show the manual login button only after auto-login has been attempted and failed
  const showManualLoginButton = () => autoLoginAttempted() && !isAuthenticated() && authError();

  // If already authenticated, render nothing - App.tsx will redirect
  // This prevents any flickering or unnecessary UI when user is already logged in
  if (authStore.state.isAuthenticated) {
    return (
      <div class="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" class="text-primary" />
      </div>
    );
  }

  return (
    <>
      {/* INSTANT STARTUP: No more "Initializing" state - isTauriEnv is set synchronously */}

      {/* Show different UI for non-Tauri environment */}
      <Show when={isTauriEnv() === false}>
        <div dir="ltr" class="flex min-h-screen items-center justify-center bg-background p-4">
          <div class="w-full max-w-lg">
            <Card class="border-0 shadow-lg bg-card">
              <CardHeader class="text-center pb-8 pt-8">
                <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950">
                  <AlertCircle class="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
                <CardTitle class="text-2xl font-bold text-foreground">
                  Desktop App Required
                </CardTitle>
                <CardDescription class="text-muted-foreground mt-2">
                  SSO authentication is only available in the Tauri desktop
                  application.
                </CardDescription>
              </CardHeader>
              <CardContent class="text-center pb-8">
                <p class="text-sm text-muted-foreground">
                  Please use the desktop app for automatic sign-in.
                  Contact IT support if you need assistance.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </Show>

      {/* Show auto-login in progress */}
      <Show when={isTauriEnv() && autoLoginInProgress()}>
        <div dir="ltr" class="flex min-h-screen items-center justify-center bg-background p-4">
          <div class="w-full max-w-lg">
            <Card class="border-0 shadow-lg bg-card">
              <CardHeader class="text-center pb-4 pt-8">
                <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Shield class="h-8 w-8 text-primary" />
                </div>
                <CardTitle class="text-2xl font-bold text-foreground">
                  IT Support
                </CardTitle>
              </CardHeader>
              <CardContent class="flex flex-col items-center justify-center py-8">
                <Spinner size="lg" class="text-primary" />
                <p class="mt-4 text-base font-medium text-foreground">
                  Signing in as {systemUsername() || "..."}
                </p>
                <p class="mt-2 text-sm text-muted-foreground">
                  Please wait while we authenticate you automatically...
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </Show>

      {/* Show SSO form when in Tauri and auto-login is not in progress */}
      <Show when={isTauriEnv() && !autoLoginInProgress()}>
        <div dir="ltr" class="flex min-h-screen items-center justify-center bg-background p-4">
          <div class="w-full max-w-lg">
            <Card class="border-0 shadow-lg bg-card">
              <CardHeader class="text-center pb-8 pt-8">
                {/* Logo/Icon */}
                <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Shield class="h-8 w-8 text-primary" />
                </div>

                <CardTitle class="text-2xl font-bold text-foreground">
                  IT Support
                </CardTitle>
                <CardDescription class="text-muted-foreground mt-2">
                  <Show when={explicitLogout()} fallback={
                    <Show when={autoLoginAttempted() && authError()} fallback="Signing in with your Windows credentials">
                      Automatic sign-in failed. Please try again.
                    </Show>
                  }>
                    You signed out. Click below to sign in again.
                  </Show>
                </CardDescription>
              </CardHeader>

              <CardContent class="space-y-8 pb-8">
                {/* Windows Username Display */}
                <div class="rounded-lg border border-border bg-secondary p-5">
                  <div class="flex items-center gap-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <User class="h-6 w-6 text-primary" />
                    </div>
                    <div class="flex-1">
                      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Windows User
                      </p>
                      <p class="font-semibold text-foreground text-lg">
                        <Show when={systemUsername()} fallback={
                          <span class="text-muted-foreground">Loading...</span>
                        }>
                          {systemUsername()}
                        </Show>
                      </p>
                    </div>
                    <Badge variant="secondary" class="bg-secondary text-foreground border-border">
                      Domain
                    </Badge>
                  </div>
                </div>

                {/* Error message - only show after auto-login has been attempted */}
                <Show when={authError() && autoLoginAttempted()}>
                  <div class="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                    <div class="flex items-start gap-3">
                      <AlertCircle class="mt-0.5 h-5 w-5 text-destructive" />
                      <div>
                        <p class="text-sm font-semibold text-destructive">
                          Authentication Failed
                        </p>
                        <p class="mt-1 text-sm text-destructive">{authError()}</p>
                      </div>
                    </div>
                  </div>
                </Show>

                {/* SSO Login Button - always shown when auto-login is not in progress */}
                <Button
                  onClick={handleManualSSOLogin}
                  disabled={showLoading() || !systemUsername()}
                  size="lg"
                  class="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 shadow-md hover:shadow-lg transition-all"
                >
                  <Show when={showLoading()} fallback={
                    <>
                      <Shield class="mr-2 h-4 w-4" />
                      <Show when={autoLoginAttempted() && authError() && !explicitLogout()} fallback="Sign in with SSO">
                        Try Again
                      </Show>
                    </>
                  }>
                    <Spinner size="sm" class="mr-2" />
                    Signing in...
                  </Show>
                </Button>

                {/* Info text */}
                <div class="text-center">
                  <Show when={explicitLogout()} fallback={
                    <Show when={autoLoginAttempted() && authError()} fallback={
                      <p class="text-sm text-muted-foreground">
                        Your Windows credentials will be used to sign in automatically.
                      </p>
                    }>
                      <p class="text-sm text-muted-foreground">
                        Click the button above to try signing in again.
                      </p>
                    </Show>
                  }>
                    <p class="text-sm text-muted-foreground">
                      Click the button above to sign in with your Windows credentials.
                    </p>
                  </Show>
                </div>
              </CardContent>

              <CardFooter class="flex-col gap-6 border-t border-border px-8 py-6 -mb-6 rounded-b-lg">
                {/* Help text only - no manual login link */}
                <p class="text-center text-xs text-muted-foreground max-w-sm mx-auto">
                  Contact IT support if you're having trouble signing in.
                </p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </Show>
    </>
  );
}
