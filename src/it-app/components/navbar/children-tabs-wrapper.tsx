'use client';

/**
 * Children Tabs Navigation Wrapper
 *
 * Consumes navigation context and renders ChildrenTabsNav.
 * This allows the tabs to render immediately with cached data
 * while fresh data is fetched in the background.
 */

import { useNavigationContext } from './navigation-provider';
import { ChildrenTabsNav } from './children-tabs-nav';

interface ChildrenTabsWrapperProps {
  serverPathname?: string;
}

export function ChildrenTabsWrapper({
  serverPathname,
}: ChildrenTabsWrapperProps) {
  const { pages } = useNavigationContext();

  return (
    <ChildrenTabsNav
      pages={pages}
      serverPathname={serverPathname}
    />
  );
}
