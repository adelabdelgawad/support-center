import { Metadata } from "next";
import { SLAReportClient } from "./_components/sla-report-client";
import { getSLAComplianceReportData } from "@/lib/actions/reports.actions";

export const metadata: Metadata = {
  title: 'SLA Compliance',
  description: 'View SLA compliance metrics and breach analysis',
};

export default async function SLAReportPage() {
  // Fetch initial data server-side with default date preset
  const initialData = await getSLAComplianceReportData("last_30_days");

  return <SLAReportClient initialData={initialData} />;
}
