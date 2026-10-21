import { useEffect, useState } from 'react';
import { defaultSettings, loadSettings, saveSettings, type ClientSettings } from '../lib/clientSettings';
import { applyClientTheme } from '../lib/clientTheme';

export function useClientSettings(notify: (message: string) => void) {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => { const refresh = () => setSettings(loadSettings()); window.addEventListener('client-settings-changed', refresh); const storage = (event: StorageEvent) => { if (event.key === 'client-settings-v1') refresh(); }; window.addEventListener('storage', storage); return () => { window.removeEventListener('client-settings-changed', refresh); window.removeEventListener('storage', storage); }; }, []);
  useEffect(() => {
    const root = document.documentElement, media = window.matchMedia('(prefers-color-scheme: light)'), motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { applyClientTheme(settings.theme, media.matches); root.dataset.reduceMotion = String(settings.motion === 'on' || (settings.motion === 'system' && motion.matches)); };
    apply(); media.addEventListener('change', apply); motion.addEventListener('change', apply);
    root.dataset.clientTranslucent = String(settings.translucent); root.dataset.clientFullWidth = String(settings.fullWidth);
    const fonts = { system: 'var(--font-sans, ui-sans-serif, -apple-system, system-ui, "Segoe UI", "Noto Sans", "Helvetica", "Arial", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif)', serif: 'Georgia, "Times New Roman", serif', mono: 'var(--font-mono, ui-monospace, monospace)' };
    for (const [name, value] of Object.entries({ '--client-accent': settings.accent, '--client-background': settings.background, '--client-foreground': settings.foreground, '--client-ui-size': settings.uiSize + 'px', '--client-content-size': settings.contentSize + 'px', '--client-code-size': settings.codeSize + 'px', '--client-ui-font': fonts[settings.font], '--client-code-font': settings.codeFont === 'mono' ? '"Courier New", ui-monospace, monospace' : 'var(--font-mono, ui-monospace, monospace)' })) root.style.setProperty(name, value);
    return () => { media.removeEventListener('change', apply); motion.removeEventListener('change', apply); };
  }, [settings]);
  function update(change: Partial<ClientSettings>) { try { setSettings(saveSettings({ ...settings, ...change })); } catch { notify('Pengaturan belum tersimpan. Periksa ruang penyimpanan browser.'); } }
  function reset() { try { setSettings(saveSettings(defaultSettings())); } catch { notify('Pengaturan belum dapat direset.'); } }
  return { settings, update, reset };
}
