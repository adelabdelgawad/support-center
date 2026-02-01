import { Metadata } from 'next';
import { validateAgentAccess } from '@/lib/actions/validate-agent-access.actions';
import { getSLAConfigs } from '@/lib/actions/sla-configs.actions';
import { getPrioritiesData } from '@/lib/actions/metadata-actions';
import { getCategories } from '@/lib/actions/categories.actions';
import { getBusinessUnits } from '@/lib/actions/business-units.actions';
import SLAConfigsClient from './_components/sla-configs-client';

export const metadata: Metadata = {
  title: 'SLA Configuration',
  description: 'Manage SLA rules and configurations',
};

export default async function SLAConfigsPage() {
  // Parallelize auth validation and data fetching
  const [_, slaConfigs, priorities, categoriesData, businessUnitsData] = await Promise.all([
    validateAgentAccess(),
    getSLAConfigs(),
    getPrioritiesData(),
    getCategories({ activeOnly: true, includeSubcategories: false }),
    getBusinessUnits({ limit: 100, skip: 0, filterCriteria: { is_active: 'true' } }),
  ]);

  return (
    <SLAConfigsClient
      initialData={slaConfigs}
      priorities={priorities}
      categories={categoriesData.categories}
      businessUnits={businessUnitsData.businessUnits}
    />
  );
}
