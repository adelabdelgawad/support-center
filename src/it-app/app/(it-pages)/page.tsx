/**
 * Home Page (Server Component)
 *
 * Empty welcome page for all authenticated users
 * No redirects - just a simple welcome message
 */

import { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/server-auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: 'Welcome',
  description: 'IT Support Center',
};

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome Back, {user.fullName || user.username}
        </h1>
        <p className="text-muted-foreground text-lg">
          IT Support Center
        </p>
      </div>
    </div>
  );
}
