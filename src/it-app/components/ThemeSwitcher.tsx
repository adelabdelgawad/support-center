'use client';

/**
 * Theme Switcher Component
 *
 * Uses next-themes for theme switching with proper SSR support
 * Theme is managed by components/theme-provider.tsx
 */

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // useEffect only runs on the client, so we can safely detect hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR or before hydration, render a placeholder to avoid mismatch
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--popover)]/10"
        title="Switch theme"
        suppressHydrationWarning
      >
        <Moon className="w-5 h-5" />
      </Button>
    );
  }

  // Handle case where theme might be 'system'
  const effectiveTheme = theme === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : (theme || 'light');

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--popover)]/10"
      onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
      title={`Switch to ${effectiveTheme === 'light' ? 'dark' : 'light'} theme`}
      suppressHydrationWarning
    >
      {effectiveTheme === 'dark' ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </Button>
  );
}
