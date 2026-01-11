import { Metadata } from "next";
import { VolumeReportClient } from "./_components/volume-report-client";
import { getVolumeAnalysisReportData } from "@/lib/actions/reports.actions";

export const metadata: Metadata = {
  title: 'Volume Analysis',
  description: 'View ticket volume trends and distribution analysis',
};

export default async function VolumeReportPage() {
  // Fetch initial data server-side with default date preset
  const initialData = await getVolumeAnalysisReportData("last_30_days");

  return <VolumeReportClient initialData={initialData} />;
}
