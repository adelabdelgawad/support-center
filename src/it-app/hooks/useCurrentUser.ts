// hooks/useCurrentUser.ts
"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { AppUser } from "@/types/auth";

/**
 * A small wrapper around custom auth context that:
 *  1. Exposes `user` as a fully typed `AppUser|null`
 *  2. Provides `_isLoading` and `error` flags
 */
export function useCurrentUser(): {
  user: AppUser | null;
  _isLoading: boolean;
  error: Error | null;
} {
  const { user, _isLoading } = useAuth();
  const error = !user && !_isLoading ? new Error("Not signed in") : null;

  return { user, _isLoading, error };
}
