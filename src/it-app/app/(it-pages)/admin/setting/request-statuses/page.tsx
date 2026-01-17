import { auth } from '@/lib/auth/server-auth';
import { validateAgentAccess } from '@/lib/actions/validate-agent-access.actions';
import { redirect } from 'next/navigation';
import { getRequestStatuses } from '@/lib/actions/request-statuses.actions';
import RequestStatusesTable from './_components/table/request-statuses-table';

export const metadata = {
  title: 'Request Statuses',
  description: 'Manage request statuses',
};

export default async function RequestStatusesPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    page?: string;
    limit?: string;
    name?: string;
  }>;
}) {
  // Validate technician access before processing
  await validateAgentAccess();
  const session = await auth();
  if (!session?.accessToken) {
    redirect('/login');
  }

  const params = await searchParams;
  const { is_active, name, page: pageParam, limit: limitParam } = params;

  const page = Number(pageParam || '1');
  const limit = Number(limitParam || '10');
  const skip = (page - 1) * limit;

  let statusesData;

  try {
    statusesData = await getRequestStatuses({
      limit,
      skip,
      filterCriteria: {
        is_active: is_active || undefined,
        name: name || undefined,
      },
    });
  } catch (error) {
    console.error('Failed to fetch request statuses:', error);
    statusesData = {
      statuses: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
      readonlyCount: 0,
    };
  }

  return <RequestStatusesTable initialData={statusesData} />;
}
