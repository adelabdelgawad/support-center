// app/(pages)/setting/roles/page.tsx
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getAllUsers, getRoles } from "@/lib/actions/roles.actions";
import { getPages } from "@/lib/actions/pages.actions";
import { redirect } from "next/navigation";
import RolesTable from "./_components/table/roles-table";

export const metadata = {
  title: 'Roles',
  description: 'Manage user roles and permissions',
};

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    page?: string;
    limit?: string;
    name?: string;
    page_id?: string;
  }>;
}) {
  const params = await searchParams;
  const { is_active, name, page_id, page: pageParam, limit: limitParam } = params;

  const page = Number(pageParam || "1");
  const limit = Number(limitParam || "10");
  const skip = (page - 1) * limit;

  // Parallelize auth validation, session check, and data fetching
  const [_, session, response, pages, users] = await Promise.all([
    validateAgentAccess(),
    auth(),
    getRoles({
      limit,
      skip,
      filterCriteria: {
        is_active: is_active || undefined,
        name: name || undefined,
        page_id: page_id || undefined,
      },
    }).catch((error) => {
      console.error("Failed to fetch roles:", error);
      return {
        roles: [],
        total: 0,
        activeCount: 0,
        inactiveCount: 0,
      };
    }),
    getPages().catch(() => ({ pages: [] })),
    getAllUsers().catch(() => []),
  ]);

  if (!session?.accessToken) {
    redirect("/login");
  }

  return (
    <RolesTable
      initialData={response}
      preloadedPages={pages?.pages ?? []}
      preloadedUsers={users ?? []}
      initialPage={page}
      initialLimit={limit}
      initialFilters={{
        is_active,
        name,
        page_id,
      }}
    />
  );
}
