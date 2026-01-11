/**
 * Tickets Store - SolidJS store for UI state only
 *
 * NOTE: Data fetching and caching is now handled by TanStack Solid Query.
 * This store only manages UI-specific state that doesn't belong in query cache.
 *
 * For data operations, see src/queries/tickets.ts instead.
 */

import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

// ============================================================================
// Store Interface - UI State Only
// ============================================================================

/**
 * UI-only state for tickets feature
 * Data is now managed by TanStack Query (see src/queries/tickets.ts)
 */
interface TicketsUIState {
  // Currently no UI state needed!
  // Modal state is handled locally in components
  // All data state is in TanStack Query cache
}

const initialState: TicketsUIState = {};

/**
 * Create the tickets store with minimal UI state
 *
 * NOTE: This store is now minimal because:
 * - Data fetching/caching is handled by TanStack Query
 * - Modal state is handled locally in tickets.tsx component
 * - WebSocket updates go directly to query cache
 *
 * This store is kept for future UI-specific state needs.
 */
function createTicketsStore() {
  const [state, setState] = createStore<TicketsUIState>({ ...initialState });

  /**
   * Reset store to initial state
   */
  const reset = (): void => {
    setState({ ...initialState });
  };

  return {
    state,
    reset,
  };
}

// Create singleton store
export const ticketsStore = createRoot(createTicketsStore);

// Note: No accessor helpers needed since there's no state currently.
// If UI state is added in the future, add accessor helpers here.
