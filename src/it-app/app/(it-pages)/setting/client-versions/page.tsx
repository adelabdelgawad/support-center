import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getClientVersions } from "@/lib/actions/client-versions.actions";
import { ClientVersionsTable } from "./_components/client-versions-table";

export const metadata = {
  title: 'Client Versions',
  description: 'Manage client application versions',
};

/**
 * Client Versions Management Page
 * Admin page for managing the version registry
 * Location: /setting/client-versions
 */
export default async function ClientVersionsPage() {
  await validateAgentAccess();

  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login");
  }

  // Fetch initial data on server
  const initialData = await getClientVersions({ activeOnly: false });

  return (
    <div className="h-full flex flex-col p-4 overflow-auto">
      <ClientVersionsTable initialData={initialData} />
    </div>
  );
}
