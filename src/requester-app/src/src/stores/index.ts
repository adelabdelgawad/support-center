/**
 * Store Index
 *
 * Re-exports all stores and selectors for convenient imports.
 *
 * Usage:
 * ```ts
 * import { authStore, ticketsStore, useUser, useTicketListItems } from '@/stores';
 * ```
 */

// Auth store
export {
  authStore,
  useIsAuthenticated,
  useUser,
  useToken,
  useAuthLoading,
  useAuthError,
  useSystemUsername,
  useIsTauriEnv,
  useAutoLoginAttempted,
  useAutoLoginInProgress,
  useExplicitLogout,
  // Phase 8: Version enforcement / update required
  useUpdateRequired,
  useEnforcementData,
  // Auth rehydration state - blocks redirects until Tauri Storage is checked
  useIsRehydrating,
} from "./auth-store";

// Tickets store
export {
  ticketsStore,
  // Note: No selectors exported - data is now managed by TanStack Query
  // See src/queries/tickets.ts for data operations
} from "./tickets-store";

// Remote Access store
export { remoteAccessStore } from "./remote-access-store";
