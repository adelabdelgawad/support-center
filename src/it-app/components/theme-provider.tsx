/**
 * Theme provider using next-themes.
 *
 * This component provides theme switching functionality (light/dark/system)
 * with proper SSR support and no flash of unstyled content.
 */

'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
