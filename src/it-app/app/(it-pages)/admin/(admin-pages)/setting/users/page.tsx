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
  // Validate technician access before processing
  await validateAgentAccess();

  // Await searchParams before destructuring
  const params = await searchParams;
  const { is_active, user_type, filter, page, limit, role } = params;

  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  // Create a filters object to pass to getUsers
  const filters: Record<string, string | undefined> = {
    is_active: is_active,
    user_type: user_type, // Filter by user type (all, technicians, users)
    username: filter,
    role_id: role, // Backend expects role_id parameter
  };

  // Fetch users and roles in parallel for better performance
  const [users, roles] = await Promise.all([
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
