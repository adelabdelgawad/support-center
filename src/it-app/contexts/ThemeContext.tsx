'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Default theme for SSR - must match server render to avoid hydration mismatch
const DEFAULT_THEME: Theme = 'light';

/**
 * Get the initial theme from localStorage or system preference.
 * Only called on client after hydration.
 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  const savedTheme = localStorage.getItem('theme') as Theme | null;
  if (savedTheme) return savedTheme;

  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start with default theme to match SSR, update after hydration
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [isHydrated, setIsHydrated] = useState(false);

  // After hydration, read actual theme from localStorage/system preference
  useEffect(() => {
    setIsHydrated(true);
    const actualTheme = getInitialTheme();
    setThemeState(actualTheme);
  }, []);

  useEffect(() => {
    // Only apply theme after hydration to avoid mismatch
    if (!isHydrated) return;

    // Apply theme to document
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);

    // Save theme preference
    localStorage.setItem('theme', theme);
  }, [theme, isHydrated]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}