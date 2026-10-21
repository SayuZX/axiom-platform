import { useEffect, useState } from 'react';
import { UIIcon as I } from '../components/UIIcon';
import { isNativeDesktop, isNativeMobile } from '../lib/nativeDesktop';

export function WindowControls() {
  const native = isNativeDesktop() && !isNativeMobile();
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!native) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    const updateHeight = () => document.documentElement.style.setProperty('--native-titlebar-height', `${66 * Math.min(1, window.innerWidth / 1920)}px`);
    updateHeight();
    window.addEventListener('resize', updateHeight);
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const current = getCurrentWindow();
      const refresh = async () => { const value = await current.isMaximized(); if (active) setMaximized(value); };
      await refresh();
      const stop = await current.onResized(() => { void refresh().catch(() => {}); });
      if (active) unlisten = stop; else stop();
    }).catch(() => { if (active) setError('Status jendela belum bisa dibaca.'); });
    return () => { active = false; unlisten?.(); window.removeEventListener('resize', updateHeight); };
  }, [native]);

  async function control(action: 'minimize' | 'toggleMaximize' | 'close') {
    try {
      setError('');
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow()[action]();
    } catch { setError('Kontrol jendela gagal. Coba lagi atau gunakan Alt+F4 untuk menutup.'); }
  }
  if (!native) return <div className="d-window-controls" aria-hidden="true"><span><I name="window-minimize" size={20}/></span><span><I name="window-restore" size={18}/></span><span><I name="close" size={20}/></span></div>;
  return <div className="d-window-controls d-native-window-controls" role="group" aria-label="Window controls">
    <button type="button" aria-label="Minimize window" title="Minimize" onClick={() => void control('minimize')}><I name="window-minimize" size={20}/></button>
    <button type="button" aria-label={maximized ? 'Restore window' : 'Maximize window'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => void control('toggleMaximize')}><I name={maximized ? 'window-restore' : 'window-maximize'} size={18}/></button>
    <button type="button" aria-label="Close window" title="Close" onClick={() => void control('close')}><I name="close" size={20}/></button>
    {error && <span className="d-window-error" role="alert">{error}</span>}
  </div>;
}
