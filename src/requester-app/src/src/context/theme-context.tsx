/**
 * Theme Context Provider - Multi-Mode Theme Support
 *
 * Provides app-wide theme switching between Light, Dark, and System modes.
 * Supports:
 * - Manual theme selection (light/dark)
 * - System theme detection (auto-follows OS preference)
 * - Persistent theme preference in localStorage
 * - Automatic CSS class management on document element
 *
 * Usage:
 * 1. Wrap your app with <ThemeProvider>
 * 2. Use the useTheme() hook in components
 * 3. Call setTheme(mode) to change theme
 */

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from "solid-js";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** Current theme mode (including 'system') */
  theme: Accessor<ThemeMode>;
  /** Resolved theme (actual light/dark being applied) */
  resolvedTheme: Accessor<ResolvedTheme>;
  /** Set theme mode explicitly */
  setTheme: (mode: ThemeMode) => void;
  /** Check if system prefers dark mode */
  systemPrefersDark: Accessor<boolean>;
}

const ThemeContext = createContext<ThemeContextValue>();

const STORAGE_KEY = "app-theme";
const DEFAULT_THEME: ThemeMode = "system";

export const ThemeProvider: ParentComponent = (props) => {
  // Initialize from localStorage or default to system
  const storedTheme = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  const [theme, setThemeSignal] = createSignal<ThemeMode>(
    storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
      ? storedTheme
      : DEFAULT_THEME
  );

  // Track system preference
  const [systemPrefersDark, setSystemPrefersDark] = createSignal(false);

  /**
   * Get system color scheme preference
   */
  const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  /**
   * Resolve theme to actual light/dark value
   */
  const resolvedTheme = (): ResolvedTheme => {
    const currentTheme = theme();
    if (currentTheme === "system") {
      return systemPrefersDark() ? "dark" : "light";
    }
    return currentTheme;
  };

  /**
   * Set theme and persist to localStorage
   */
  const setTheme = (mode: ThemeMode) => {
    setThemeSignal(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  /**
   * Apply theme class to document element
   */
  const applyThemeClass = (theme: ResolvedTheme) => {
    const root = document.documentElement;

    // Remove both classes first
    root.classList.remove("light", "dark");

    // Add the resolved theme class
    root.classList.add(theme);
  };

  /**
   * Listen for system theme changes
   */
  onMount(() => {
    // Set initial system preference
    setSystemPrefersDark(getSystemTheme() === "dark");

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    // Cleanup
    onCleanup(() => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    });
  });

  /**
   * Apply theme whenever it changes
   */
  createEffect(() => {
    const resolved = resolvedTheme();
    applyThemeClass(resolved);
  });

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme,
    systemPrefersDark,
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to access theme context
 * @throws Error if used outside ThemeProvider
 */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
