'use client';
import GlobalFeedback from './GlobalFeedback';
import Skeleton from './Skeleton';

import { useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { errorLabel, request, rupiah } from '../merchant/components/ui';
import ThemeToggle from './ThemeToggle';
import Icon from './Icon';
import { adminNavigation } from '../../lib/admin-navigation.mjs';
import './customer-dashboard.css';
import './customer-dashboard-mobile.css';
import './customer-quota-reference.css';
import { AdminEmbed } from './AdminEmbed';
import { ErrorDialog } from '../manage/AdminDialog';

const navigation = {
  customer: [
    ['Ruang kerja', [['/account', 'Ringkasan'], ['/account/logs', 'Log Permintaan'], ['/account/performance', 'Peringkat & TPS']]],
    ['Developer', [['/account/setup', 'One Click Setup'], ['/account/keys', 'Kunci API'], ['/playground', 'Playground'], ['/account/models', 'Katalog Model'], ['/account/status', 'Status Sistem']]],
    ['Saldo & Tagihan', [['/account/billing', 'Saldo & Billing'], ['/account/quota-history', 'Riwayat Kuota'], ['/account/calculator', 'Kalkulator'], ['/buy', 'Beli paket']]],
    ['Informasi', [['/account/updates', 'Pembaruan'], ['/terms', 'Terms of Service'], ['/privacy', 'Privacy Policy']]],
    ['Jelajahi', [['/', 'Situs publik'], ['/pricing', 'Harga & model'], ['/docs', 'Dokumentasi']]],
  ],
  admin: adminNavigation,
};


function useDashboardSession(role, revision) {
  const [session, setSession] = useState({ loading: true, identity: null, error: '', guest: false });
  useEffect(() => {
    const controller = new AbortController();
    setSession({ loading: true, identity: null, error: '', guest: false });
    request(role === 'admin' ? '/merchant-api/admin/status' : '/account-api/session', { signal: controller.signal }).then((data) => {
      if (role === 'admin') {
        if (data.isAdmin !== true) throw new Error('Status administrator belum dapat diverifikasi.');
        return { name: 'Administrator situs' };
      }
      if (data.authenticated === false) return null;
      if (data.authenticated !== true || !data.customer?.id) throw new Error('Sesi pelanggan belum dapat diverifikasi.');
      return data.customer;
    }).then((identity) => {
      if (!controller.signal.aborted) setSession({ loading: false, identity, error: '', guest: !identity });
    }).catch((error) => {
      if (!controller.signal.aborted) setSession({ loading: false, identity: null, error: error.status === 401 ? '' : errorLabel(error), guest: error.status === 401 });
    });
    return () => controller.abort();
  }, [role, revision]);
  return session;
}

function MaintenanceBadge() {
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    let active;
    async function load() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      try {
        const response = await fetch('/site-api/maintenance', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Status unavailable');
        const data = await response.json();
        if (typeof data.enabled !== 'boolean') throw new Error('Invalid maintenance status');
        if (!controller.signal.aborted) setStatus(data.enabled ? 'maintenance' : 'off');
      } catch {
        if (!controller.signal.aborted) setStatus('unknown');
      }
    }
    load();
    const interval = window.setInterval(load, 30000);
    const visible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active?.abort(); window.clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return status === 'loading' ? <Skeleton variant="inline" rows={1} label="Memuat status layanan…" /> : <span className={`customer-maintenance-badge${status === 'maintenance' ? ' is-maintenance' : ''}`} role="status">{status === 'maintenance' ? 'Maintenance' : status === 'unknown' ? 'Belum diketahui' : null}</span>;
}

export default function DashboardShell(props) {
  const embedded = useContext(AdminEmbed);
  return embedded && props.role === 'admin' ? <EmbeddedAdminShell {...props}/> : <StandaloneDashboardShell {...props}/>;
}

function EmbeddedAdminShell({ children, title, description }) {
  const [revision, setRevision] = useState(0);
  const session = useDashboardSession('admin', revision);
  useEffect(() => { if (session.guest) window.location.replace('/login'); }, [session.guest]);
  return <section className="axiom-site dashboard dashboard-admin native-admin-panel" aria-label={title}>
    <div className="dash-page-heading"><div className="wrap"><div><h1>{title}</h1>{description && <p>{description}</p>}</div></div></div>
    <div className="dash-content wrap">
      <ErrorDialog message={session.error}/>
      {session.error && <button className="dash-button" type="button" onClick={() => setRevision(value => value + 1)}>Periksa sesi lagi</button>}
      {session.loading && <Skeleton label="Memeriksa sesi administrator…" />}
      {session.identity && children}
    </div>
  </section>;
}

function StandaloneDashboardShell({ children, title, description, role = 'customer' }) {
  const pathname = usePathname();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const session = useDashboardSession(role, revision);
  const [wallet, setWallet] = useState({ loading: true, balance: null, error: '' });
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    function dismiss(event) {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
    }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [menuOpen]);
  const identity = session.identity;
  useEffect(() => {
    if (session.guest) router.replace(role === 'admin' ? '/login' : `/account/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [session.guest, role, router]);
  useEffect(() => {
    if (role !== 'customer' || !identity) return;
    let active = null;
    function load() {
      active?.abort();
      const controller = new AbortController(); active = controller;
      request('/wallet-api/summary', { signal: controller.signal }).then((data) => {
        if (data.currency !== 'IDR' || !Number.isSafeInteger(data.balance) || data.balance < 0) throw new Error('Saldo belum dapat diverifikasi.');
        if (!controller.signal.aborted) setWallet({ loading: false, balance: data.balance, error: '' });
      }).catch((error) => { if (!controller.signal.aborted) setWallet({ loading: false, balance: null, error: errorLabel(error) }); });
    }
    load();
    const visible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('wallet-updated', load);
    document.addEventListener('visibilitychange', visible);
    return () => { active?.abort(); window.removeEventListener('wallet-updated', load); document.removeEventListener('visibilitychange', visible); };
  }, [role, identity, pathname]);
  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true); setLogoutError('');
    try {
      const data = await request(role === 'admin' ? '/api/auth/logout' : '/account-api/logout', { method: 'POST', body: {} });
      if (role === 'admin' && data.success !== true) throw new Error('Logout admin belum dapat dipastikan.');
      window.location.assign(role === 'admin' ? '/login' : '/account/login');
    } catch (error) { setLogoutError(errorLabel(error)); setLogoutBusy(false); }
  }
  return <div className={`axiom-site dashboard dashboard-${role}${role === 'customer' ? ' customer-workspace quota-reference' : ''}`}>
    {role === 'customer' ? <>
      <a className="customer-skip" href="#main">Lewati ke konten</a>
      <header className="customer-header">
        <button ref={menuButton} className="customer-menu" type="button" aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'} aria-expanded={menuOpen} aria-controls="customer-navigation" onClick={() => setMenuOpen(value => !value)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
        <a className="customer-brand" href="/account">AXIOM <span>AI</span></a>
        <div className="customer-header-tools"><a href="/docs">Dokumentasi</a><ThemeToggle compact /></div>
      </header>
      <aside id="customer-navigation" className={`customer-sidebar${menuOpen ? ' is-open' : ''}`}>
        <div className="customer-wallet"><a href="/account/billing" title={wallet.error || 'Saldo dompet IDR'}><span>Saldo tersedia</span><strong>{!identity ? '—' : wallet.loading ? <Skeleton variant="inline" rows={1} label="Memuat saldo…" /> : wallet.error ? 'Belum tersedia' : rupiah(wallet.balance)}</strong></a><a className="dash-button dash-button-primary" href="/account/billing#topup">Isi saldo</a></div>
        <nav aria-label="Navigasi akun">{navigation.customer.map(([group, links]) => <section key={group}><h2>{group}</h2>{links.map(([href, label]) => <a key={href} href={href} aria-current={pathname === href ? 'page' : undefined} onClick={() => setMenuOpen(false)}><Icon name={href} /><span>{label}{href === '/account/status' && <MaintenanceBadge />}</span></a>)}</section>)}</nav>
        <div className="customer-profile">{identity ? <><strong>{identity.name || identity.email}</strong>{identity.email && <span>{identity.email}</span>}<button className="dash-text-button" type="button" disabled={logoutBusy} onClick={logout}>{logoutBusy ? 'Keluar…' : 'Keluar akun'}</button></> : <span>{session.loading ? <Skeleton rows={2} label="Memeriksa sesi…" /> : session.error ? 'Sesi belum tersedia' : 'Mengalihkan ke login…'}</span>}</div>
      </aside>
    </> : <><a className="admin-skip" href="#main">Lewati ke konten</a><header className="admin-header"><button ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? 'Tutup menu' : 'Menu'}</button><a href="/dashboard" className="admin-brand">9router <span>AXIOM</span></a><div className="admin-header-tools"><a href="/dashboard">Ringkasan router</a><ThemeToggle compact /></div></header><aside id="admin-navigation" className={`admin-sidebar${menuOpen ? ' is-open' : ''}`}><nav aria-label="Navigasi 9router">{navigation.admin.map(([group, links]) => <section key={group}><h2>{group}</h2>{links.map(([href, label]) => <a key={href} href={href} aria-current={pathname === href ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{label}</a>)}</section>)}</nav></aside></>}
    <main id="main" className="dash-main" tabIndex="-1">
      <div className="dash-page-heading"><div className="wrap"><div>{role === 'admin' && <span className="eyebrow hero-eyebrow">PENGELOLAAN / AXIOM AI</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{role === 'admin' && <div className="dash-identity">{identity ? <><strong>{identity.name || identity.email}</strong>{identity.email && <span>{identity.email}</span>}<button className="dash-text-button" type="button" disabled={logoutBusy} onClick={logout}>{logoutBusy ? 'Keluar…' : 'Keluar akun'}</button></> : <span>{session.loading ? 'Memeriksa sesi…' : session.error ? 'Sesi belum tersedia' : 'Mengalihkan ke login…'}</span>}</div>}</div></div>
      <div className="dash-content wrap">
        {logoutError && <GlobalFeedback>{logoutError}</GlobalFeedback>}
        {session.error && <section className="dash-card"><h2>Sesi belum dapat diperiksa</h2><GlobalFeedback>{session.error}</GlobalFeedback><button className="dash-button" type="button" onClick={() => setRevision((value) => value + 1)}>Periksa sesi lagi</button></section>}
        {session.loading && <Skeleton rows={5} label="Memuat dashboard Anda…" />}
        {identity && children}
      </div>
    </main><footer className="dash-footer wrap"><span>{role === 'customer' ? 'Panduan penggunaan API' : 'AXIOM AI · Satu koneksi. Lebih banyak kemungkinan.'}</span><a href="/docs">Dokumentasi API</a><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a><a href="/changelog">Changelog</a></footer>
  </div>;
}
