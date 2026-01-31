// app/(pages)/setting/users/page.tsx
import { auth } from "@/lib/auth/server-auth";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getUsers, getActiveRolesForUserForms } from "@/lib/actions/users.actions";
import { redirect } from "next/navigation";
import UsersTable from "./_components/table/users-table";

export const metadata = {
  title: 'Users',
  description: 'Manage user accounts',
};

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str: string | undefined): boolean {
  if (!str) return false;
  return UUID_REGEX.test(str);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    user_type?: string;
    filter?: string;
    page?: string;
    limit?: string;
    role?: string;
  }>;
}) {
  const params = await searchParams;
  const { is_active, user_type, filter, page, limit, role } = params;

  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  // Validate role parameter - only include if it's a valid UUID
  const validatedRole = role && isValidUUID(role) ? role : undefined;

  // Create a filters object to pass to getUsers
  const filters: Record<string, string | undefined> = {
    is_active: is_active,
    user_type: user_type, // Filter by user type (all, technicians, users)
    username: filter,
    role_id: validatedRole, // Backend expects role_id parameter (UUID)
  };

  // Parallelize auth validation and data fetching
  const [_, users, roles] = await Promise.all([
    validateAgentAccess(),
    getUsers(limitNumber, skip, filters),
    getActiveRolesForUserForms(),
  ]);

  return (
    <UsersTable
      initialData={users}
      roles={roles}
    />
  );
}
