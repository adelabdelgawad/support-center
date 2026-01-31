// app/(it-pages)/setting/business-unit-regions/page.tsx
import { auth } from '@/lib/auth/server-auth';
import { validateAgentAccess } from '@/lib/actions/validate-agent-access.actions';
import { getBusinessUnitRegions } from '@/lib/actions/business-unit-regions.actions';
import { redirect } from 'next/navigation';
import BusinessUnitRegionsTable from './_components/table/regions-table';

export const metadata = {
  title: 'Regions',
  description: 'Manage business unit regions',
};

export default async function BusinessUnitRegionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    page?: string;
    limit?: string;
    name?: string;
  }>;
}) {
  const params = await searchParams;
  const { is_active, name, page: pageParam, limit: limitParam } = params;

  const page = Number(pageParam || '1');
  const limit = Number(limitParam || '10');
  const skip = (page - 1) * limit;

  // Parallelize auth validation, session check, and data fetching
  let response;
  try {
    const [_, session, regionsData] = await Promise.all([
      validateAgentAccess(),
      auth(),
      getBusinessUnitRegions({
        limit,
        skip,
        filterCriteria: {
          is_active: is_active || undefined,
          name: name || undefined,
        },
      }),
    ]);

    if (!session?.accessToken) {
      redirect('/login');
    }

    response = regionsData;
  } catch (error) {
    console.error('Failed to fetch business unit regions:', error);
    // Provide empty initial data on error
    response = {
      regions: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
    };
  }

  return <BusinessUnitRegionsTable initialData={response} />;
}
