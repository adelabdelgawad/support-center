import { auth } from '@/lib/auth/server-auth';
import { validateAgentAccess } from '@/lib/actions/validate-agent-access.actions';
import { redirect } from 'next/navigation';
import { getRequestTypes } from '@/lib/actions/request-types.actions';
import RequestTypesTable from './_components/table/request-types-table';

export const metadata = {
  title: 'Request Types',
  description: 'Manage request types',
};

export default async function RequestTypesPage({
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

  let typesData;

  try {
    typesData = await getRequestTypes({
      limit,
      skip,
      filterCriteria: {
        is_active: is_active || undefined,
        name: name || undefined,
      },
    });
  } catch (error) {
    console.error('Failed to fetch request types:', error);
    typesData = {
      types: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
    };
  }

  return <RequestTypesTable initialData={typesData} />;
}
