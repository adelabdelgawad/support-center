import * as React from "react"

// Breakpoint definitions
const MOBILE_BREAKPOINT = 640
const TABLET_BREAKPOINT = 1024

export type ViewportType = "mobile" | "tablet" | "desktop"

export interface ViewportState {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  viewport: ViewportType
}

// Default state for SSR - always render as desktop to avoid hydration mismatch
const DEFAULT_VIEWPORT_STATE: ViewportState = {
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  viewport: "desktop",
}

/**
 * Hook to detect viewport size with three breakpoints:
 * - mobile: < 640px
 * - tablet: 640px - 1023px
 * - desktop: >= 1024px
 *
 * IMPORTANT: Returns desktop state during SSR to avoid hydration mismatch.
 * After hydration, returns the actual viewport state.
 */
export function useViewport(): ViewportState {
  const [isHydrated, setIsHydrated] = React.useState(false)
  const [state, setState] = React.useState<ViewportState>(DEFAULT_VIEWPORT_STATE)

  React.useEffect(() => {
    const getViewportState = (width: number): ViewportState => {
      if (width < MOBILE_BREAKPOINT) {
        return { isMobile: true, isTablet: false, isDesktop: false, viewport: "mobile" }
      }
      if (width < TABLET_BREAKPOINT) {
        return { isMobile: false, isTablet: true, isDesktop: false, viewport: "tablet" }
      }
      return { isMobile: false, isTablet: false, isDesktop: true, viewport: "desktop" }
    }

    const updateState = () => {
      // Use requestAnimationFrame to batch layout reads and prevent forced reflow
      requestAnimationFrame(() => {
        setState(getViewportState(window.innerWidth))
      })
    }

    // Mark as hydrated and set initial state
    setIsHydrated(true)
    updateState()

    // Listen for resize events
    const mqlMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const mqlTablet = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`)

    mqlMobile.addEventListener("change", updateState)
    mqlTablet.addEventListener("change", updateState)

    return () => {
      mqlMobile.removeEventListener("change", updateState)
      mqlTablet.removeEventListener("change", updateState)
    }
  }, [])

  // DEBUG: Log state changes (disabled to prevent forced layout)
  // React.useEffect(() => {
  //   const result = isHydrated ? state : DEFAULT_VIEWPORT_STATE
  //   console.log('[useViewport] State:', {
  //     isHydrated,
  //     internalState: state,
  //     returning: result,
  //     windowWidth: typeof window !== 'undefined' ? window.innerWidth : 'N/A'
  //   })
  // }, [isHydrated, state])

  // Return default (desktop) state during SSR to match server render
  // After hydration, return actual viewport state
  return isHydrated ? state : DEFAULT_VIEWPORT_STATE
}

/**
 * Simple hook to detect if viewport is mobile (< 640px)
 * @deprecated Consider using useViewport() for more granular control
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(false)
  const [isHydrated, setIsHydrated] = React.useState(false)

  React.useEffect(() => {
    setIsHydrated(true)
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  // Return false during SSR to match initial server render
  // After hydration, return actual mobile state
  return isHydrated ? isMobile : false
}

// Export breakpoints for use in other components
export { MOBILE_BREAKPOINT, TABLET_BREAKPOINT }
