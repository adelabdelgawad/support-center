/**
 * Client-side hook to access session context.
 *
 * This hook provides access to the current user session and refresh function.
 * It must be used within a component that's a child of ClientAppWrapper.
 */

'use client';

import { useContext } from 'react';
import { SessionContext, type SessionContextType } from '@/components/auth/client-app-wrapper';

/**
 * Hook to access session information in client components.
 *
 * @returns SessionContextType - Session context with user and refresh function
 * @throws Error if used outside of ClientAppWrapper
 *
 * @example
 * function MyComponent() {
 *   const { user, refresh, isRefreshing } = useSession();
 *
 *   if (!user) {
 *     return <div>Not authenticated</div>;
 *   }
 *
 *   return <div>Hello, {user.username}!</div>;
 * }
 */
export function useSession(): SessionContextType {
  const context = useContext(SessionContext);

  if (context === undefined) {
    throw new Error('useSession must be used within ClientAppWrapper');
  }

  return context;
}
