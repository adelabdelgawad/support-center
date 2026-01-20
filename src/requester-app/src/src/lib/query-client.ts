/**
 * TanStack Query Client
 *
 * Centralized QueryClient instance used throughout the app.
 * Separated from index.tsx to avoid circular dependencies.
 */

import { QueryClient } from "@tanstack/solid-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
