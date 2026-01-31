/**
 * i18n Middleware for Next.js
 *
 * IMPORTANT: This is a separate middleware file for i18n.
 * To integrate it with the main middleware, you'll need to:
 * 1. Either merge this with the existing middleware.ts
 * 2. Or use middleware chaining if you have multiple middlewares
 *
 * This middleware handles:
 * - Locale detection from cookies or browser headers
 * - Locale routing (e.g., /en/dashboard, /ar/dashboard)
 * - Automatic redirection to default locale if none specified
 */

import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Optionally configure localePrefix
  // 'always': Always use locale prefix (e.g., /en, /ar)
  // 'as-needed': Omit default locale prefix (e.g., / for ar, /en for en)
  localePrefix: 'as-needed',

  // Optionally configure locale detection
  localeDetection: true,
});

export const config = {
  // Match only internationalized pathnames
  matcher: [
    // Match all pathnames except for
    // - … if they start with `/api`, `/_next` or `/_vercel`
    // - … the ones containing a dot (e.g. `favicon.ico`)
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
