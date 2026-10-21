'use client';
import Skeleton from './Skeleton';

import { useEffect, useRef, useState } from 'react';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import { errorLabel, request } from '../merchant/components/ui';

const defaultNavLinks = [['/', 'GET STARTED', 'home'], ['/pricing', 'PRICING & MODELS', 'pricing'], ['/calculator', 'CALCULATOR', 'calculator'], ['/buy', 'BELI PAKET', 'buy'], ['/docs', 'DOCS', 'docs']];

export function useCustomerSession(enabled = true) {
  const [state, setState] = useState({ loading: true, customer: null, error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ loading: true, customer: null, error: '' });
    request('/account-api/session', { signal: controller.signal }).then((data) => {
      if (typeof data.authenticated !== 'boolean' || (data.authenticated && !data.customer?.id)) throw new Error('Sesi akun belum dapat diperiksa.');
      if (!controller.signal.aborted) setState({ loading: false, customer: data.authenticated ? data.customer : null, error: '' });
    }).catch((error) => { if (!controller.signal.aborted) setState({ loading: false, customer: null, error: errorLabel(error) }); });
    return () => controller.abort();
  }, [enabled, version]);
  async function logout() {
    await request('/account-api/logout', { method: 'POST', body: {} });
    setState({ loading: false, customer: null, error: '' });
  }
  return { ...state, reload: () => setVersion((value) => value + 1), logout };
}

export default function SiteHeader({ view = '', catalog, loading: catalogLoading, commerce, session, loginUrl = '/account/login', navLinks = defaultNavLinks, menuGroups, accountLink }) {
  const ownSession = useCustomerSession(session === undefined);
  const account = session ?? ownSession;
  const [metadata, setMetadata] = useState({ loading: true, available: false, models: [] });
  const [paymentState, setPaymentState] = useState('loading');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigationRef = useRef(null);
  useEffect(() => {
    if (catalog !== undefined) return;
    const controller = new AbortController();
    request('/site-api/catalog', { signal: controller.signal }).then((data) => {
      if (!Array.isArray(data.models) || typeof data.available !== 'boolean') throw new Error('Katalog tidak tersedia');
      setMetadata({ loading: false, available: data.available, models: data.available ? data.models.filter((model) => typeof model.id === 'string' && typeof model.name === 'string' && typeof model.provider === 'string') : [] });
    }).catch(() => { if (!controller.signal.aborted) setMetadata({ loading: false, available: false, models: [] }); });
    return () => controller.abort();
  }, [catalog]);
  useEffect(() => {
    if (commerce !== undefined) return;
    const controller = new AbortController();
    request('/commerce-api/packages', { signal: controller.signal }).then((data) => setPaymentState(data.configured === true ? 'configured' : 'unconfigured')).catch(() => { if (!controller.signal.aborted) setPaymentState('unavailable'); });
    return () => controller.abort();
  }, [commerce]);
  useEffect(() => {
    if (!menuOpen) return;
    navigationRef.current?.querySelector('a')?.focus();
    function onKey(event) { if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); menuRef.current?.focus(); } }
    function outside(event) { if (!navigationRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setMenuOpen(false); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [menuOpen]);
  const data = catalog ?? metadata;
  const loading = catalogLoading ?? metadata.loading;
  const payment = commerce ?? paymentState;
  const accountHref = accountLink?.href ?? (account.customer || account.error ? '/account' : loginUrl);
  const accountLabel = accountLink?.label ?? (account.loading || account.error ? 'AKUN' : account.customer ? 'AKUN SAYA' : 'MASUK');
  return <>
    <a className="skip-link" href="#main">Lewati ke konten</a>
    <div className="ticker" aria-label="Informasi gateway"><span>AXIOM AI GATEWAY</span><i/><span>{loading ? <Skeleton variant="inline" rows={1} label="Memuat katalog model…" /> : data.available ? `${new Intl.NumberFormat('id-ID').format(data.models.length)} MODEL DI KATALOG` : 'KATALOG BELUM TERSEDIA'}</span><i/><span>SATU API UNTUK APLIKASI & EDITOR</span><i/><span>OPENAI-COMPATIBLE</span><i/><span>{payment === 'configured' ? 'PEMBAYARAN QRIS AKTIF' : payment === 'loading' ? <Skeleton variant="inline" rows={1} label="Memeriksa pembayaran QRIS…" /> : payment === 'unavailable' ? 'STATUS QRIS BELUM TERSEDIA' : 'QRIS · BELUM DIAKTIFKAN'}</span></div>
    <header className="site-header">
      <a href="/" aria-label="AXIOM AI beranda"><BrandLogo/></a>
      <nav className="desktop-nav" aria-label="Navigasi utama">{navLinks.map(([href, label, key]) => <a href={href} key={key} className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined}>{label}</a>)}</nav>
      <div className="header-actions"><ThemeToggle compact/><button ref={menuRef} type="button" className="menu-toggle" aria-label={menuOpen ? 'Tutup menu' : 'Menu tambahan'} aria-expanded={menuOpen} aria-controls="extra-navigation" onClick={() => setMenuOpen((open) => !open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14" />{!menuOpen && <path d="M12 5v14" />}</svg></button><a className="admin-link" href={accountHref}>{accountLabel} <span aria-hidden="true">↗</span></a></div>
      {menuOpen && <nav ref={navigationRef} id="extra-navigation" className={`mobile-nav${menuGroups ? ' grouped-navigation' : ''}`} aria-label="Menu tambahan" onClick={(event) => { if (event.target.closest('a')) setMenuOpen(false); }}>{menuGroups ? menuGroups.map(([heading, links]) => <section key={heading}><h2>{heading}</h2>{links.map(([href, label]) => <a key={href} href={href} aria-current={view === href ? 'page' : undefined}>{label} <span aria-hidden="true">↗</span></a>)}</section>) : <>{navLinks.map(([href, label, key]) => <a key={href} href={href} aria-current={view === key ? 'page' : undefined}>{label} ↗</a>)}<a href={accountHref}>{account.error ? 'Periksa sesi akun' : account.customer ? 'Akun & pesanan' : 'Masuk akun pelanggan'} ↗</a><a href="/#faq">Tanya jawab ↗</a></>}</nav>}
    </header>
  </>;
}
