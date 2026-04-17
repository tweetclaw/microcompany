export type ThemePreference = 'light' | 'dark' | 'ocean';
export type ResolvedTheme = 'light' | 'dark' | 'ocean';

const STORAGE_KEY = 'microcompany-theme-preference';

export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function loadThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'ocean') {
    return stored;
  }
  return 'dark';
}

export function saveThemePreference(theme: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, theme);
}
