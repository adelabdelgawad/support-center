/**
 * Admin Hub Page
 *
 * Main landing page for all administrative settings.
 * Displays categorized cards with links to various admin pages.
 */

import { AdminHub } from "./_components/admin-hub";

export default function AdminPage() {
  return (
    <div className="container mx-auto px-4 py-6 bg-[var(--sdp-content-bg)] min-h-[calc(100vh-48px)]">
      <AdminHub />
    </div>
  );
}
