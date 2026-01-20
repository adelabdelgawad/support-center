/**
 * Application Entry Point
 *
 * Sets up the SolidJS application with:
 * - TanStack Solid Query provider
 * - SolidJS Router with route definitions
 * - SignalR real-time providers
 * - Notification context provider
 */

import { render } from "solid-js/web";
import { Router, Route, Navigate } from "@solidjs/router";
import { QueryClientProvider } from "@tanstack/solid-query";
import { lazy } from "solid-js";
import { RealTimeProvider, NotificationSignalRProvider } from "@/signalr";
import { NotificationProvider } from "@/context/notification-context";
import { LanguageProvider } from "@/context/language-context";
import { ThemeProvider } from "@/context/theme-context";
import { queryClient } from "@/lib/query-client";
import App from "./App";
import "./index.css";

// Lazy load pages for code splitting
const SSOPage = lazy(() => import("@/routes/sso"));
const TicketsPage = lazy(() => import("@/routes/tickets"));
const TicketChatPage = lazy(() => import("@/routes/ticket-chat"));
const SettingsPage = lazy(() => import("@/routes/settings"));

// Re-export for backwards compatibility
export { queryClient } from "@/lib/query-client";

// Get root element
const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

// HMR FIX: Force clean root on Vite HMR updates to prevent "double page" effect
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    console.log('[HMR] 🔄 Before update - cleaning root to prevent duplicate content');
    // Clear root to prevent stacking old/new content
    root.innerHTML = '';
  });
}

// Render the application with route configuration
const dispose = render(
  () => (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <NotificationProvider>
            <NotificationSignalRProvider>
              <RealTimeProvider>
                <Router root={App}>
                  <Route path="/" component={() => <Navigate href="/tickets" />} />
                  <Route path="/sso" component={SSOPage} />
                  <Route path="/tickets" component={TicketsPage} />
                  <Route path="/tickets/:ticketId/chat" component={TicketChatPage} />
                  <Route path="/settings" component={SettingsPage} />
                </Router>
              </RealTimeProvider>
            </NotificationSignalRProvider>
          </NotificationProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  ),
  root
);

// HMR FIX: Dispose previous render on hot update
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[HMR] 🧹 Disposing previous render to prevent memory leaks');
    dispose();
  });
}
