'use client';
import GlobalFeedback from './GlobalFeedback';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import './theme-toggle.css';

export default function ThemeToggle({ compact = false }) {
  const [dark, setDark] = useState(false);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(sync);
    sync();
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    window.axiomSetTheme(next ? 'dark' : 'light');
    setDark(next);
    setSaved(document.documentElement.dataset.themeSaved !== 'false');
  }
  return <div className={`theme-control${compact ? ' theme-control-compact' : ''}`}>
    <button className="theme-trigger" type="button" aria-label={dark ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'} aria-pressed={dark} onClick={toggle}><Icon name="moon" /></button>
    {!saved && <GlobalFeedback>Tema aktif. Browser tidak mengizinkan penyimpanan preferensi.</GlobalFeedback>}
  </div>;
}
