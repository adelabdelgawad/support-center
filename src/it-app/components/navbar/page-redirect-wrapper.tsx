'use client';

/**
 * Page Redirect Handler Wrapper
 *
 * Consumes navigation context and renders PageRedirectHandler.
 * This component handles auto-redirects for parent pages without paths.
 */

import { useNavigationContext } from './navigation-provider';
import { PageRedirectHandler } from './page-redirect-handler';

export function PageRedirectWrapper() {
  const { pages } = useNavigationContext();

  return <PageRedirectHandler pages={pages} />;
}
