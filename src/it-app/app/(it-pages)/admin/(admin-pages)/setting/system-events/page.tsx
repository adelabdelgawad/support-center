import { auth } from '@/lib/auth/server-auth';
import { validateAgentAccess } from '@/lib/actions/validate-agent-access.actions';
import { redirect } from 'next/navigation';
import { getSystemEvents } from '@/lib/actions/system-events.actions';
import SystemEventsTable from './_components/table/system-events-table';

export const metadata = {
  title: 'System Events',
  description: 'Manage system events',
};

export default async function SystemEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    page?: string;
    limit?: string;
    event_name?: string;
  }>;
}) {
  // Validate technician access before processing
  await validateAgentAccess();
  const session = await auth();
  if (!session?.accessToken) {
    redirect('/login');
  }

  const params = await searchParams;
  const { is_active, event_name, page: pageParam, limit: limitParam } = params;

  const page = Number(pageParam || '1');
  const limit = Number(limitParam || '10');
  const skip = (page - 1) * limit;

  let eventsData;

  try {
    eventsData = await getSystemEvents({
      limit,
      skip,
      filterCriteria: {
        is_active: is_active || undefined,
        event_name: event_name || undefined,
      },
    });
  } catch (error) {
    console.error('Failed to fetch system events:', error);
    eventsData = {
      events: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
    };
  }

  return <SystemEventsTable initialData={eventsData} />;
}
