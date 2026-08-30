import { createContext, useContext, useState, useEffect } from 'react';
import { SCHEMES, DEFAULT_SCHEME_ID } from '../schemes';
import { deriveScale } from '../lib/color';
import { useTheme } from './ThemeContext';

const SchemeContext = createContext(null);

// Muted text/surface tones are derived relative to text/bg so they scale
// sensibly for any scheme instead of being hand-picked per palette.
const buildMuted = (roles, isDark) => ({
  muted: roles.surface,
  mutedForeground: isDark ? '#93a696' : '#55645a', // neutral gray-green fallback; close enough for a "try it out" picker
});

function applyScheme(scheme, isDark) {
  const roles = isDark ? scheme.dark : scheme.light;
  const root = document.documentElement.style;

  root.setProperty('--background', roles.bg);
  root.setProperty('--foreground', roles.text);
  root.setProperty('--card', roles.surface);
  root.setProperty('--card-foreground', roles.text);
  root.setProperty('--border', roles.border);
  root.setProperty('--primary', roles.primary);
  root.setProperty('--primary-foreground', roles.onPrimary);
  root.setProperty('--ring', roles.primary);

  const muted = buildMuted(roles, isDark);
  root.setProperty('--muted', muted.muted);
  root.setProperty('--muted-foreground', muted.mutedForeground);

  const brandScale = deriveScale(roles.primary);
  for (const [step, hex] of Object.entries(brandScale)) root.setProperty(`--color-brand-${step}`, hex);

  const accentScale = deriveScale(roles.accent);
  for (const step of [300, 400, 500, 600, 700]) root.setProperty(`--color-accent-${step}`, accentScale[step]);

  // "Success" reuses brand, matching the shipped default's convention.
  root.setProperty('--color-success-400', brandScale[400]);
  root.setProperty('--color-success-500', brandScale[500]);
  root.setProperty('--color-success-600', brandScale[600]);
}

export function SchemeProvider({ children }) {
  const { theme } = useTheme();
  const [schemeId, setSchemeId] = useState(() => localStorage.getItem('wms_scheme') || DEFAULT_SCHEME_ID);

  useEffect(() => {
    const scheme = SCHEMES.find((s) => s.id === schemeId) || SCHEMES[0];
    applyScheme(scheme, theme === 'dark');
    localStorage.setItem('wms_scheme', schemeId);
  }, [schemeId, theme]);

  return (
    <SchemeContext.Provider value={{ schemeId, setSchemeId, schemes: SCHEMES }}>
      {children}
    </SchemeContext.Provider>
  );
}

export function useScheme() {
  const ctx = useContext(SchemeContext);
  if (!ctx) throw new Error('useScheme must be used within SchemeProvider');
  return ctx;
}
