"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Theme switcher button for the horizontal top navigation bar.
 *
 * Uses next-themes for theme management and displays:
 * - Sun icon in dark mode (switch to light)
 * - Moon icon in light mode (switch to dark)
 *
 * Matches ServiceDesk Plus styling with subtle hover effects.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder to avoid hydration mismatch
    return (
      <button
        className="flex items-center justify-center w-9 h-9 rounded-md transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
        aria-label="Toggle theme"
        type="button"
      >
        <div className="w-5 h-5" />
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center justify-center w-9 h-9 rounded-md transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      type="button"
    >
      {isDark ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  );
}
