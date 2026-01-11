import { Metadata } from "next";
import { ReportsDashboardClient } from "./_components/reports-dashboard-client";
import { serverFetch, CACHE_PRESETS } from "@/lib/api/server-fetch";
import type { ExecutiveDashboardData } from "@/types/reports";

export const metadata: Metadata = {
  title: 'Reports',
  description: 'View reports and analytics for IT support operations',
};

export default async function ReportsPage() {
  // Fetch initial data server-side with default date preset
  let initialData: ExecutiveDashboardData | null = null;

  try {
    initialData = await serverFetch<ExecutiveDashboardData>(
      '/reports/dashboard/executive?date_preset=last_30_days',
      CACHE_PRESETS.SHORT_LIVED()
    );
  } catch (error) {
    console.error('Error fetching executive dashboard:', error);
    // Client will show loading state and fetch on mount
  }

  return <ReportsDashboardClient initialData={initialData} />;
}
