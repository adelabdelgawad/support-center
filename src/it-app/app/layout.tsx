/**
 * Root layout component (server component).
 *
 * This layout remains a server component to support:
 * - Server-side authentication checks
 * - SSR benefits (no flash of unauthenticated content)
 * - Session fetching before hydration
 *
 * The only client provider (ClientAppWrapper) is used here to wrap children,
 * keeping the rest of the app tree as server components where possible.
 */

import type { Metadata } from "next";
import "./globals.css";
import ClientAppWrapper from "@/components/auth/client-app-wrapper";
import { isPublicRoute } from "@/lib/auth/auth-guard";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/lib/auth/check-token";

// Microsoft Fluent Design System Fonts
// Fonts are configured via CSS in globals.css to use system fonts
// (Segoe UI on Windows, San Francisco on macOS, Roboto on Linux)
// See FLUENT_UI_FONTS.md for optional local font file setup

export const metadata: Metadata = {
  title: {
    template: '%s | IT Support Center',
    default: 'IT Support Center',
  },
  description: 'IT service catalog and support management system',
};

/**
 * Root layout - server component.
 *
 * Enforces authentication for all pages except public routes (login, SSO).
 * Fetches the session on the server and passes it to ClientAppWrapper,
 * which is the only client component in the app tree.
 *
 * This pattern:
 * - Validates session on server (fast, no network latency)
 * - Redirects unauthenticated users to login (except on public pages)
 * - Passes valid session to client (no refetch on hydration)
 * - Keeps most of the app as server components (better for SSR)
 * - Provides session context to client components via useSession()
 * - Provides theme context via next-themes
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get current pathname from proxy-set header
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";

  // Check if this is a public route (login, SSO, etc.)
  const isPublic = isPublicRoute(pathname);

  // Get session from cookies (lightweight check)
  // The protected layout will do full validation for protected routes
  let session: User | null = null;

  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;
    const userDataCookie = cookieStore.get("user_data")?.value;

    if (accessToken && userDataCookie) {
      // Parse user data from cookie
      session = JSON.parse(userDataCookie) as User;
    }
  } catch (error) {
    console.error("Error reading session cookies:", error);
    session = null;
  }

  // Enforce authentication for non-public routes
  // Redirect to login if no valid session
  if (!isPublic && !session) {
    redirect("/login");
  }

  return (
    <html
      lang="en"
      data-arp=""
      suppressHydrationWarning // Required for next-themes: prevents warning when theme class/style applied on client
    >
      <body className="antialiased">
        {/*
          ClientAppWrapper is the main client provider for session and theme.
          It receives the server-fetched session and provides it to
          useSession() hooks in descendant client components.
        */}
        <ClientAppWrapper initialSession={session}>
          {children}
        </ClientAppWrapper>
      </body>
    </html>
  );
}
