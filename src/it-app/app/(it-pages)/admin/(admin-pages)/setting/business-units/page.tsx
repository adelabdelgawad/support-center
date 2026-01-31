import { auth } from '@/lib/auth/server-auth';
import { validateAgentAccess } from '@/lib/actions/validate-agent-access.actions';
import { redirect } from 'next/navigation';
import { getBusinessUnits, getActiveRegionsForForms } from '@/lib/actions/business-units.actions';
import BusinessUnitsTable from './_components/table/business-units-table';
import type { BusinessUnitListResponse, BusinessUnitResponse } from '@/types/business-units';
import type { BusinessUnitRegionResponse } from '@/types/business-unit-regions';

export const metadata = {
  title: 'Business Units',
  description: 'Manage business units',
};

export default async function BusinessUnitsPage({
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

  let businessUnitsData: BusinessUnitListResponse;
  let regionsData: BusinessUnitRegionResponse[];

  try {
    const [_, session, units, regions] = await Promise.all([
      validateAgentAccess(),
      auth(),
      getBusinessUnits({
        limit,
        skip,
        filterCriteria: {
          is_active: is_active || undefined,
          name: name || undefined,
        },
      }),
      getActiveRegionsForForms(),
    ]);

    if (!session?.accessToken) {
      redirect('/login');
    }

    businessUnitsData = units;
    regionsData = regions;
  } catch (error) {
    console.error('Failed to fetch business units:', error);
    businessUnitsData = {
      businessUnits: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
    };
    regionsData = [];
  }

  return <BusinessUnitsTable initialData={businessUnitsData} regions={regionsData} />;
}
