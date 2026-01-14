/**
 * App Component - Root Layout with Auth Guard
 *
 * This component handles:
 * - Auth state initialization on app load
 * - Loading state while checking auth
 * - Protected route wrapper (redirect to SSO if not authenticated)
 * - Notification click navigation
 * - Session logging initialization and global error handling
 */

import { useNavigate, useLocation, RouteSectionProps } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  onMount,
  onCleanup,
  ErrorBoundary,
  Suspense,
  Show,
  type ParentComponent,
} from "solid-js";
import { authStore, useIsAuthenticated, useUpdateRequired, useEnforcementData, useIsRehydrating } from "@/stores";
import { NotificationContainer } from "@/components/ui/notification";
import { ConnectionErrorBanner } from "@/components/connection-error-banner";
import { FloatingIconSync } from "@/components/floating-icon-sync";
import { AppShellSkeleton } from "@/components/app-shell-skeleton";
import { RemoteSessionBanner } from "@/components/remote-session-banner";
import { IncomingRequestBanner } from "@/components/incoming-request-banner";
import { listen } from "@tauri-apps/api/event";
import { RuntimeConfig } from "@/lib/runtime-config";
import UpdateRequired from "@/components/UpdateRequired";
import { logger } from "@/logging";

// Route loading now uses AppShellSkeleton for instant visual structure
// See components/app-shell-skeleton.tsx

/**
 * Root Layout Component
 * Handles auth initialization and guards
 */
// Session storage key for preserving route across SSO redirect
const REDIRECT_PATH_KEY = "auth_redirect_path";

const App: ParentComponent<RouteSectionProps> = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();
  const updateRequired = useUpdateRequired();
  const enforcementData = useEnforcementData();
  const isRehydrating = useIsRehydrating();

  // Track RuntimeConfig initialization status
  const [isRuntimeConfigReady, setIsRuntimeConfigReady] = createSignal(false);

  // CRITICAL: Initialize RuntimeConfig BEFORE rendering child components
  // This ensures API calls don't fail with "RuntimeConfig not initialized"
  onMount(async () => {
    // Initialize session logging first (fail-safe, non-blocking)
    await logger.init();
    logger.info('app', 'Frontend initialization started');

    // Detect network mode (internal vs external) - needed for correct API URL
    // This MUST complete before any API calls are made
    await RuntimeConfig.initialize();
    const networkInfo = RuntimeConfig.getDebugInfo();
    logger.info('network', 'Network mode detected', {
      mode: networkInfo.mode,
      location: networkInfo.location,
      localIP: networkInfo.localIP,
      serverAddress: networkInfo.serverAddress,
    });

    // Mark RuntimeConfig as ready - this will trigger child component rendering
    setIsRuntimeConfigReady(true);

    // Trigger background refresh of auth from persistent storage
    // This does NOT block - auth state is already available from sync cache
    authStore.refreshFromStorage();

    logger.info('app', 'Frontend initialization complete');
  });

  // Global error handlers for unhandled exceptions
  onMount(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logger.error('app', 'Unhandled promise rejection', {
        reason: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
      });
    };

    // Handle global errors
    const handleError = (event: ErrorEvent) => {
      logger.error('app', 'Unhandled error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    onCleanup(() => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    });
  });

  // Listen for notification click navigation events from Tauri
  onMount(() => {
    // Check if we're running in Tauri
    if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) {
      let unlisten: (() => void) | undefined;

      // Start async listener registration
      listen<string>("navigate-to-chat", (event) => {
        const ticketId = event.payload;
        navigate(`/tickets/${ticketId}/chat`);
      })
        .then((unlistenFn) => {
          unlisten = unlistenFn;
        })
        .catch((error) => {
          console.error("[App] Failed to register notification click listener:", error);
        });

      // Register cleanup synchronously (before async completes)
      onCleanup(() => {
        unlisten?.();
      });
    }
  });

  // Redirect logic - waits for rehydration to complete before making redirect decisions
  // This prevents premature redirects to /sso on page refresh when auth exists in Tauri Storage
  createEffect(() => {
    const currentPath = location.pathname;
    const currentSearch = location.search;
    const isAuthPage = currentPath === "/sso";
    // Access store properties directly for reactivity tracking
    const isAuth = authStore.state.isAuthenticated;
    const rehydrating = authStore.state.isRehydrating;

    // CRITICAL: Wait for rehydration to complete before making any redirect decisions
    // This prevents redirecting to /sso when valid auth exists in Tauri Storage
    if (rehydrating) {
      return; // Don't make any redirect decisions yet
    }

    if (!isAuth && !isAuthPage) {
      // Not authenticated and not on auth page -> redirect to SSO
      // Save the current path so we can restore it after login
      const fullPath = currentPath + currentSearch;
      if (fullPath !== "/" && fullPath !== "/tickets") {
        // Only save non-default paths
        try {
          sessionStorage.setItem(REDIRECT_PATH_KEY, fullPath);
        } catch {
          // sessionStorage might not be available
        }
      }
      navigate("/sso", { replace: true });
    } else if (isAuth && isAuthPage) {
      // Authenticated but on auth page -> redirect to saved path or tickets
      let redirectTo = "/tickets";
      try {
        const savedPath = sessionStorage.getItem(REDIRECT_PATH_KEY);
        if (savedPath) {
          redirectTo = savedPath;
          sessionStorage.removeItem(REDIRECT_PATH_KEY);
        }
      } catch {
        // sessionStorage might not be available
      }
      navigate(redirectTo, { replace: true });
    }
  });

  // Handle retry from update required screen
  const handleUpdateRetry = () => {
    authStore.clearUpdateRequired();
  };

  return (
    <ErrorBoundary
      fallback={(err, reset) => {
        // Log the error to session logs
        logger.error('app', 'React ErrorBoundary caught error', {
          message: err.message,
          stack: err.stack,
          name: err.name,
        });

        return (
        <div class="flex min-h-screen items-center justify-center bg-background p-4">
          <div class="w-full max-w-md rounded-lg border border-destructive bg-card p-6 shadow-lg">
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <svg
                  class="h-5 w-5 text-destructive"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <h2 class="text-lg font-semibold text-destructive">
                  Application Error
                </h2>
                <p class="mt-2 text-sm text-muted-foreground">
                  {err.message || "An unexpected error occurred"}
                </p>
                <details class="mt-3">
                  <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Technical Details
                  </summary>
                  <pre class="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
                    {err.stack || err.toString()}
                  </pre>
                </details>
                <button
                  class="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  onClick={reset}
                >
                  Reload Application
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      }}
    >
      {/* Phase 8: Update Required Screen - Blocking UI when version enforcement triggers */}
      <Show when={updateRequired() && enforcementData()}>
        {(data) => (
          <UpdateRequired
            enforcementData={data()}
            onRetry={handleUpdateRetry}
          />
        )}
      </Show>

      {/* Wait for RuntimeConfig initialization before rendering app */}
      <Show when={!isRuntimeConfigReady()} fallback={
        /* Normal app content - only shown when not in update required state */
        <Show when={!updateRequired()}>
          {/* Incoming Request Banner - Shows when waiting for user acceptance */}
          {isAuthenticated() && <IncomingRequestBanner />}

          {/* Remote Session Banner - Shows when remote session is active */}
          {isAuthenticated() && <RemoteSessionBanner />}

          {/* Notification Container - Always visible */}
          <NotificationContainer />

          {/* Connection Error Banner - Only when authenticated (SignalR only connects when auth'd) */}
          {isAuthenticated() && <ConnectionErrorBanner />}

          {/* Floating Icon Sync - Only when authenticated */}
          {isAuthenticated() && <FloatingIconSync />}

          {/* Suspense boundary for lazy-loaded routes - shows skeleton instead of blank spinner */}
          <Suspense fallback={<AppShellSkeleton />}>
            <div class="h-screen w-full overflow-hidden bg-background">
              {props.children}
            </div>
          </Suspense>
        </Show>
      }>
        {/* Loading state while RuntimeConfig initializes */}
        <AppShellSkeleton />
      </Show>
    </ErrorBoundary>
  );
};

export default App;
