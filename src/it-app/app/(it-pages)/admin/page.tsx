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

export default function AdminPage() {
  return <AdminHub />;
}
