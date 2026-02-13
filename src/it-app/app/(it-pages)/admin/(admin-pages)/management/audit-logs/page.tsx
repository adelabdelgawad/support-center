import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getAuditLogs, getAuditFilterOptions } from "@/lib/actions/audit.actions";
import { AuditTable } from "./_components/audit-table";

export const metadata = {
  title: "Audit Logs",
  description: "View audit trail of all system actions",
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    action?: string;
    resource_type?: string;
    user_id?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
  }>;
}) {
  const params = await searchParams;

  const pageNumber = Number(params.page) || 1;
  const limitNumber = Number(params.limit) || 20;

  const [_, session, logsData, filterOptions] = await Promise.all([
    validateAgentAccess(),
    auth(),
    getAuditLogs({
      page: pageNumber,
      limit: limitNumber,
      action: params.action,
      resourceType: params.resource_type,
      userId: params.user_id,
      search: params.search,
      startDate: params.start_date,
      endDate: params.end_date,
    }),
    getAuditFilterOptions(),
  ]);

  if (!session?.accessToken) {
    redirect("/login");
  }

  return <AuditTable initialData={logsData} filterOptions={filterOptions} />;
}
