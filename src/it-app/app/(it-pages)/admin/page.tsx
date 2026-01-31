/**
 * Admin Hub Page
 *
 * Main landing page for all administrative settings.
 * Displays categorized cards with links to various admin pages.
 *
 * This page has NO left sidebar - it's a full-width dashboard.
 * The sidebar only appears on admin sub-pages.
 */

import { AdminHub } from "./_components/admin-hub";
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getUserFromToken } from "@/lib/api/auth-validation";
import { serverFetch } from "@/lib/api/server-fetch";
import type { Page } from "@/types/pages";

export default async function AdminPage() {
  // Validate access first
  await validateAgentAccess();

  // Get current user
  const user = await getUserFromToken();

  if (!user) {
    throw new Error("User not found");
  }

  // Fetch user pages from backend
  const pages = await serverFetch<Page[]>(`/users/${user.id}/pages`);

  return <AdminHub pages={pages} />;
}
