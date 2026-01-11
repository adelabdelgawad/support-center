'use server';

import { redirect } from 'next/navigation';
import { validateTechnicianAccess, getUserFromToken } from '@/lib/api/auth-validation';
import { getServerAccessToken } from '@/lib/api/server-fetch';

/**
 * Validate that the current user has technician access
 *
 * This server action:
 * 1. Validates the user's JWT token
 * 2. Checks if user has is_technician = true
 * 3. Logs authorization events for security auditing
 * 4. Redirects to unauthorized page if access denied
 *
 * Usage in page.tsx:
 * export default async function AgentPage() {
 *   await validateAgentAccess();
 *   // Page content here
 * }
 */
export async function validateAgentAccess(): Promise<void> {
  // Validate technician status
  const validation = await validateTechnicianAccess();

  if (!validation.isValid) {
    // Token is invalid or expired - redirect to login
    console.warn(
      `[Auth] Invalid token detected - redirecting to login. Error: ${validation.error}`
    );

    // NOTE: Don't clear cookies here - it causes "Cookies can only be modified in a Server Action or Route Handler" error
    // The login page will handle clearing cookies on the client side
    redirect('/login?returnUrl=/support-center/requests');
  }

  if (!validation.isTechnician) {
    // User is authenticated but not a technician - log and redirect to unauthorized
    const user = await getUserFromToken();

    console.warn(
      `[AuthZ] Unauthorized access attempt by non-technician user. User: ${user?.username} (${user?.id}). Reason: ${validation.error}`
    );

    // Redirect to unauthorized page with error reason
    redirect('/unauthorized?reason=not_technician');
  }

  // User is a valid technician - allow access
  const user = await getUserFromToken();
  console.info(
    `[AuthZ] Technician user granted access. User: ${user?.username} (${user?.id})`
  );
}

/**
 * Validate access for a specific agent feature/page
 * More granular control for different sections
 */
export async function validateAgentFeatureAccess(featureName: string): Promise<void> {
  const validation = await validateTechnicianAccess();

  if (!validation.isValid) {
    console.warn(
      `[Auth] Invalid token for feature access: ${featureName}. Error: ${validation.error}`
    );

    // NOTE: Don't clear cookies here - it causes "Cookies can only be modified in a Server Action or Route Handler" error
    // The login page will handle clearing cookies on the client side
    redirect('/login');
  }

  if (!validation.isTechnician) {
    const user = await getUserFromToken();
    console.warn(
      `[AuthZ] Unauthorized feature access attempt. Feature: ${featureName}, User: ${user?.username} (${user?.id})`
    );
    redirect(`/unauthorized?reason=not_technician&feature=${featureName}`);
  }

  const user = await getUserFromToken();
  console.info(
    `[AuthZ] Agent feature access granted. Feature: ${featureName}, User: ${user?.username}`
  );
}

/**
 * Check technician access without redirecting
 * Use this in components that need to conditionally render based on access
 */
export async function checkAgentAccess(): Promise<{
  hasAccess: boolean;
  isTechnician: boolean;
  userId?: string;
  username?: string;
  error?: string;
}> {
  try {
    const validation = await validateTechnicianAccess();

    return {
      hasAccess: validation.isValid && validation.isTechnician,
      isTechnician: validation.isTechnician,
      userId: validation.userId,
      username: validation.username,
      error: validation.error,
    };
  } catch (error) {
    console.error('[AuthZ] Error checking agent access:', error);
    return {
      hasAccess: false,
      isTechnician: false,
      error: 'Failed to validate access',
    };
  }
}
