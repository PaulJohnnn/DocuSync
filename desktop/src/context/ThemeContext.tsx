/**
 * @module ThemeContext
 *
 * Provides dark/light theme state to the entire React tree.
 *
 * - Default mode: **dark** (`#0f1117` background).
 * - Persists preference to `localStorage` under `docusync_theme`.
 * - Applies `"dark"` or `"light"` class directly to `<html>` so that
 *   CSS variables in `index.css` switch automatically.
 * - No dependency on `next-themes` — this is a plain React context.
 *
 * **Usage:**
 * ```tsx
 * import { useTheme } from '@/context/ThemeContext';
 *
 * const { theme, toggleTheme } = useTheme();
 * ```
 *
 * @packageDocumentation
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** The two supported colour modes. */
export type Theme = 'dark' | 'light';

/**
 * Shape of the context value exposed by {@link ThemeProvider}.
 */
export interface ThemeContextValue {
  /** The currently active theme. */
  theme: Theme;
  /** `true` when the current theme is dark. */
  isDark: boolean;
  /**
   * Toggles between dark and light. Persists to localStorage.
   * Mutates the `<html>` class list to trigger CSS variable switches.
   */
  toggleTheme: () => void;
  /**
   * Explicitly sets the theme. Useful for a theme picker with more
   * than two options (if extended in future).
   */
  setTheme: (theme: Theme) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'docusync_theme_v4';
const DEFAULT_THEME: Theme = 'light';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps the application and provides theme state via {@link ThemeContext}.
 *
 * Must be placed above all components that call {@link useTheme}.
 *
 * @param children - Child React nodes.
 */
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialise from localStorage, falling back to dark.
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  // Apply the class to <html> and persist whenever `theme` changes.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current theme state and toggle helpers.
 *
 * Must be called inside a {@link ThemeProvider}.
 *
 * @throws {Error} If called outside a `ThemeProvider`.
 *
 * @example
 * ```tsx
 * const { isDark, toggleTheme } = useTheme();
 * return <button onClick={toggleTheme}>{isDark ? '☀️' : '🌙'}</button>;
 * ```
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>.');
  }
  return ctx;
}
