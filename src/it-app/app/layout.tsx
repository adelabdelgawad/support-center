/**
 * Root layout component (server component).
 *
 * Performance optimizations inspired by network-manager:
 * - Inline script prevents theme flash on hydration
 * - Lightweight session check with redirect
 * - Minimal client provider (only session + theme + SignalR)
 * - All data fetched server-side and passed as props where possible
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
 * PERFORMANCE OPTIMIZATION:
 * - Inline script sets dir/lang before React hydrates to prevent LTR/RTL flash
 * - Suppress hydration warnings for next-themes class/style application
 * - ClientAppWrapper has minimal surface area (session + theme + SignalR only)
 * - Uses `disableTransitionOnChange` on ThemeProvider for performance
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get language and direction from headers (like network-manager)
  const headersList = await headers();
  const lang = headersList.get('x-language') || 'en';
  const direction = headersList.get('x-direction') || 'ltr';

  // Get pathname from proxy-set header
  const pathname = headersList.get("x-pathname") || "/";

  // Check if this is a public route (login, SSO, etc.)
  const isPublic = isPublicRoute(pathname);

  // Get session from cookies (lightweight check)
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
  if (!isPublic && !session) {
    redirect("/login");
  }

  return (
    <html
      lang={lang}
      dir={direction}
      suppressHydrationWarning
    >
      <head>
        {/* Inline script prevents LTR/RTL and theme flash on hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
            // Set initial direction and language before React hydrates
            document.documentElement.dir = '${direction}';
            document.documentElement.lang = '${lang}';
          `,
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {/*
          ClientAppWrapper is the main client provider for session and theme.
          Minimal surface area, receives server-fetched session.
        */}
        <ClientAppWrapper initialSession={session}>
          {children}
        </ClientAppWrapper>
      </body>
    </html>
  );
}
