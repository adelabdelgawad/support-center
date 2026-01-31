/**
 * Dashboard Page (Server Component)
 *
 * Fetches dashboard data and renders the dashboard
 * This page is for technician users only
 */

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server-auth";
import { getDashboardStats } from "@/lib/actions/dashboard.actions";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'IT Support Center dashboard with key metrics and quick actions',
};

export default async function DashboardPage() {
  // Require authentication
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Only technicians can access the dashboard
  if (!user.isTechnician && !user.isSuperAdmin) {
    redirect("/");
  }

  // Fetch dashboard stats
  const stats = await getDashboardStats();

  return <DashboardClient user={user} stats={stats} />;
}
