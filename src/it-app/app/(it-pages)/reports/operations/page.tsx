import { Metadata } from 'next';
import OperationsDashboardClient from './_components/operations-dashboard-client';
import { getOperationsDashboardData } from '@/lib/actions/reports.actions';

export const metadata: Metadata = {
  title: 'Operations',
  description: 'Operational metrics and volume analytics',
};

export default async function OperationsDashboardPage() {
  // Fetch initial data server-side with default date preset
  const initialData = await getOperationsDashboardData('last_30_days');

  return <OperationsDashboardClient initialData={initialData} />;
}
