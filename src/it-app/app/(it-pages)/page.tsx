/**
 * Home Dashboard Page (Server Component)
 *
 * Fetches dashboard data and renders the dashboard
 * This is the root page (/) for authenticated users
 */

import { Metadata } from "next";
import { cookies } from "next/headers";
import { getDashboardStats } from "@/lib/actions/dashboard.actions";
import { DashboardClient } from "./dashboard-client";
import type { AppUser } from "@/types/auth";

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'IT Support Center dashboard with key metrics and quick actions',
};

async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const cookieStore = await cookies();
    const userDataCookie = cookieStore.get('user_data');

    if (!userDataCookie || !userDataCookie.value) {
      return null;
    }

    const userData = JSON.parse(userDataCookie.value);
    return userData;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export default async function DashboardPage() {
  // Fetch user and dashboard data in parallel
  const [user, stats] = await Promise.all([
    getCurrentUser(),
    getDashboardStats(),
  ]);

  return <DashboardClient user={user} stats={stats} />;
}
