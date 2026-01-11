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
  // Validate technician access before processing
  await validateAgentAccess();

  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login");
  }

  const params = await searchParams;
  const { is_active, name, page_id, page: pageParam, limit: limitParam } = params;

  const page = Number(pageParam || "1");
  const limit = Number(limitParam || "10");
  const skip = (page - 1) * limit;

  // Fetch roles data with error handling
  let response;
  try {
    response = await getRoles({
      limit,
      skip,
      filterCriteria: {
        is_active: is_active || undefined,
        name: name || undefined,
        page_id: page_id || undefined,
      },
    });
  } catch (error) {
    console.error("Failed to fetch roles:", error);
    // Provide empty initial data on error
    response = {
      roles: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
    };
  }

  const [pages, users] = await Promise.all([
    getPages().catch(() => ({ pages: [] })),
    getAllUsers().catch(() => [])
  ]);

  return (
    <RolesTable
      initialData={response}
      preloadedPages={pages?.pages ?? []}
      preloadedUsers={users ?? []}
    />
  );
}
