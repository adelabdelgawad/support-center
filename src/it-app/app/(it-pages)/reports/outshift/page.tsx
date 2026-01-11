import { Metadata } from "next";
import { OutshiftReportClient } from "./_components/outshift-report-client";
import { getOutshiftReportData } from "@/lib/actions/reports.actions";

export const metadata: Metadata = {
  title: 'Outshift Report',
  description: 'View agent activity outside of business hours',
};

export default async function OutshiftReportPage() {
  // Fetch initial data server-side with default date preset
  const initialData = await getOutshiftReportData("last_30_days");

  return <OutshiftReportClient initialData={initialData} />;
}
