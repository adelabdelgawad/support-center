/**
 * Request Details Page (Server Component)
 * Route: /support-center/requests/(details)/[id]
 *
 * PERFORMANCE OPTIMIZED (Phase 2.3):
 * - Renders IMMEDIATELY without blocking on network calls
 * - Shows skeleton while data loads in background
 * - Data fetching happens client-side via SWR hooks
 *
 * NOTE: Backend enforces access control via role dependencies.
 * If non-technician accesses this route, backend API calls will return 403.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { RequestDetailsWrapper } from './_components/request-details-wrapper';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

// Generate dynamic metadata from route params (no blocking fetch)
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  // Use first segment of UUID for readable display
  const shortId = id.split('-')[0].toUpperCase();

  return {
    title: `Request #${shortId}`,
    description: `View details for service request ${shortId}`,
  };
}

// Get current user info from cookie (FAST - no network call)
async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const userDataCookie = cookieStore.get('user_data');

    if (!userDataCookie || !userDataCookie.value) {
      return null;
    }

    const userData = JSON.parse(userDataCookie.value);
    return userData;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  // Validate UUID format (fast, no network)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    redirect('/support-center/requests');
  }

  // Get user from cookie (fast, no network)
  const user = await getCurrentUser();

  // Render immediately with wrapper that handles data fetching in background
  // NO blocking awaits - all data fetching happens client-side via SWR
  return (
    <RequestDetailsWrapper
      requestId={id}
      currentUserId={user?.id}
      currentUserIsTechnician={user?.isTechnician ?? false}
    />
  );
}
