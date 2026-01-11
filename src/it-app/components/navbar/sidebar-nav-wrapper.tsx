'use client';

/**
 * Sidebar Navigation Wrapper
 *
 * Consumes navigation context and renders navigation for both desktop and mobile:
 * - Desktop (≥ lg): VerticalSidebarNav inside shadcn Sidebar
 * - Mobile (< lg): MobileNavDrawer (Sheet-based drawer with section grouping)
 *
 * PERFORMANCE: Accepts pre-built serverNavigation from server
 * to enable instant rendering without client-side processing.
 */

import { useNavigationContext } from './navigation-provider';
import { VerticalSidebarNav } from './vertical-sidebar-nav';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { useSidebar } from '@/components/ui/sidebar';
import type { UserInfo } from '@/lib/types/auth';

// NavItem structure matching VerticalSidebarNav
interface NavItem {
  id: string;
  title: string;
  path: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

interface SidebarNavWrapperProps {
  user: UserInfo;
  serverPathname?: string;
  /** Pre-built navigation structure from server for instant SSR */
  serverNavigation?: NavItem[];
}

export function SidebarNavWrapper({
  user,
  serverPathname,
  serverNavigation,
}: SidebarNavWrapperProps) {
  const { pages } = useNavigationContext();
  const { openMobile, setOpenMobile } = useSidebar();

  return (
    <>
      {/* Desktop sidebar (hidden on mobile via Tailwind lg: in sidebar.tsx) */}
      <VerticalSidebarNav
        pages={pages}
        user={user}
        serverPathname={serverPathname}
        serverNavigation={serverNavigation}
      />

      {/* Mobile drawer with section grouping (only visible < lg) */}
      <MobileNavDrawer
        pages={pages}
        user={user}
        serverPathname={serverPathname}
        serverNavigation={serverNavigation}
        open={openMobile}
        onOpenChange={setOpenMobile}
      />
    </>
  );
}
