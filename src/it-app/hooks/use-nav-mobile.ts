import * as React from "react";

/**
 * Navigation-specific mobile breakpoint.
 * Uses Tailwind's lg breakpoint (1024px) to match the design requirement:
 * - Desktop ≥ lg: persistent sidebar
 * - Mobile < lg: hidden drawer
 */
const NAV_MOBILE_BREAKPOINT = 1024;

/**
 * Hook to detect if viewport should show mobile navigation (< 1024px).
 *
 * This is separate from useIsMobile() which uses 640px for general mobile detection.
 * Navigation uses a higher breakpoint because the sidebar needs more space.
 *
 * IMPORTANT: Returns false during SSR to avoid hydration mismatch.
 * After hydration, returns the actual state.
 */
export function useNavMobile(): boolean {
  const [isNavMobile, setIsNavMobile] = React.useState(false);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    setIsHydrated(true);

    const mql = window.matchMedia(`(max-width: ${NAV_MOBILE_BREAKPOINT - 1}px)`);

    const onChange = () => {
      setIsNavMobile(mql.matches);
    };

    // Set initial value
    setIsNavMobile(mql.matches);

    // Listen for changes
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Return false during SSR to match server render
  return isHydrated ? isNavMobile : false;
}

export { NAV_MOBILE_BREAKPOINT };
