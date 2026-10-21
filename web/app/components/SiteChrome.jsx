'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [copyStatus, setCopyStatus] = useState('THE NEXT CHAPTER IS LOADING.');

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { setReduced(preference.matches); setPaused(preference.matches); };
    apply();
    preference.addEventListener('change', apply);
    return () => preference.removeEventListener('change', apply);
  }, []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText('https://axiomcreative.xyz');
      setCopyStatus('ALAMAT BERHASIL DISALIN.');
    } catch {
      setCopyStatus('Salin manual: https://axiomcreative.xyz');
    }
  }

  return <div className={paused ? 'site paused' : 'site'}>
    <a className="skip" href="#main">Lewati ke konten utama</a>
    <div className="shell">
      <header className="masthead">
        <Link className="brand" href="/" aria-label="Axiom Creative, beranda">
          <svg className="brand-mark" viewBox="0 0 44 45" aria-hidden="true"><path d="M1 40 19 4h7l17 36H31L22 20l-9 20Z" /><path d="m17 34 5-9 5 9Z" /></svg>
          <span className="brand-name">AXIOM<span>CREATIVE</span></span>
        </Link>
        <nav className="nav" aria-label="Navigasi utama">
          {pathname === '/' ? <a className="about-link" href="#about">TENTANG PROYEK ↗</a> : <Link href="/">BERANDA ↗</Link>}
          <Link className="health-link" href="/health" aria-current={pathname === '/health' ? 'page' : undefined}>STATUS SISTEM ↗</Link>
          <span className="status">PRE-LAUNCH</span>
          <button className="motion" type="button" aria-pressed={paused} aria-label={paused ? 'Aktifkan animasi' : 'Jeda animasi'} disabled={reduced} title={reduced ? 'Animasi nonaktif sesuai preferensi perangkat' : undefined} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'} MOTION</button>
        </nav>
      </header>
      {children}
      <footer className="footer">
        <div><span className="footer-brand">AXIOM CREATIVE</span><br />INDEPENDENT MINDS. SHARED STORIES.</div>
        <div className="barcode" aria-hidden="true" />
        <div className="footer-right">
          <button type="button" className="copy" onClick={copyAddress} aria-label="Salin alamat axiomcreative.xyz">AXIOMCREATIVE.XYZ <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6h8v8H6zM10 4V2H2v8h2" /></svg></button>
          <p className="copy-status" role="status">{copyStatus}</p>
        </div>
      </footer>
    </div>
  </div>;
}
