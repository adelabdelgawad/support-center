import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getClientVersions } from "@/lib/actions/client-versions.actions";
import ClientVersionsTable from "./_components/table/client-versions-table";

export const metadata = {
  title: 'Client Versions',
  description: 'Manage client application versions',
};

/**
 * Client Versions Management Page
 * Admin page for managing the version registry
 * Location: /setting/client-versions
 */
export default async function ClientVersionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    platform?: string;
    active_only?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  await validateAgentAccess();

  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login");
  }

  // Await searchParams before destructuring
  const params = await searchParams;
  const { platform, active_only, page, limit } = params;

  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;

  // Fetch initial data on server
  const initialData = await getClientVersions({
    platform,
    activeOnly: active_only === "true",
  });

  return (
    <ClientVersionsTable
      session={session}
      initialData={initialData}
      page={pageNumber}
      limit={limitNumber}
    />
  );
}
