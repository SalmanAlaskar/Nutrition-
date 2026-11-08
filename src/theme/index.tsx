import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import {
  darkPalette,
  fontSize,
  fontWeight,
  layout,
  lightPalette,
  radius,
  spacing,
  type Palette,
} from './tokens';

export * from './tokens';

export interface Theme {
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  /** Screen rhythm: gutter, section gap, item gap. */
  layout: typeof layout;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  isDark: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';

  const value = useMemo<Theme>(
    () => ({
      colors: isDark ? darkPalette : lightPalette,
      spacing,
      radius,
      layout,
      fontSize,
      fontWeight,
      isDark,
    }),
    [isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return theme;
}
