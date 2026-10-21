import type { ClientSettings } from './clientSettings';

export function resolveClientTheme(preference: ClientSettings['theme'], systemLight: boolean): 'light' | 'dark' {
  return preference === 'system' ? systemLight ? 'light' : 'dark' : preference;
}
export function applyClientTheme(preference: ClientSettings['theme'], systemLight: boolean) {
  const theme = resolveClientTheme(preference, systemLight), root = document.documentElement;
  root.dataset.clientTheme = theme; root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === 'light' ? '#ffffff' : '#000000';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
  // Android exposes only a presentation-only, origin-scoped message endpoint.
  try { (window as Window & { SuperGPTTheme?: { postMessage: (mode: string) => void } }).SuperGPTTheme?.postMessage(preference); } catch { /* Web colors remain usable if the optional native endpoint is unavailable. */ }
  return theme;
}
