import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getActiveSessionsPageData } from "@/lib/actions/sessions.actions";
import { ActiveSessionsTable } from "./_components/active-sessions-table";

export const metadata = {
  title: 'Active Sessions',
  description: 'View and manage active user sessions',
};

/**
 * Active Sessions Management Page
 * Server component - fetches all data server-side with pagination and filtering
 * Location: /management/active-sessions
 */
export default async function ActiveSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    version_status?: string;
    filter?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  const params = await searchParams;
  const { is_active, version_status, filter, page, limit } = params;

  // Parse pagination params
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;

  // Parallelize auth validation, session check, and data fetching
  const [_, session, pageData] = await Promise.all([
    validateAgentAccess(),
    auth(),
    getActiveSessionsPageData({
      isActive: is_active,
      versionStatus: version_status,
      filter,
      page: pageNumber,
      limit: limitNumber,
    }),
  ]);

  if (!session?.accessToken) {
    redirect("/login");
  }

  return <ActiveSessionsTable initialData={pageData} />;
}
