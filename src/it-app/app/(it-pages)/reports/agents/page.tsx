import { Metadata } from "next";
import { AgentPerformanceClient } from "./_components/agent-performance-client";
import { getAgentPerformanceReportData } from "@/lib/actions/reports.actions";

export const metadata: Metadata = {
  title: 'Agent Performance',
  description: 'View technician performance metrics and rankings',
};

export default async function AgentPerformancePage() {
  // Fetch initial data server-side with default date preset
  const initialData = await getAgentPerformanceReportData("last_30_days");

  return <AgentPerformanceClient initialData={initialData} />;
}
