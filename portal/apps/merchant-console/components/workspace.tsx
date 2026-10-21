'use client';
import { createContext, useContext, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  DashboardSquare01Icon,
  ArrowLeft01Icon,
  Invoice01Icon,
  Wallet01Icon,
  Key01Icon,
  UserGroupIcon,
  Shield01Icon,
  ChartHistogramIcon,
  Menu01Icon,
  Logout01Icon,
} from '@hugeicons/core-free-icons';
import { api, useResource } from '../lib/api';
import type { User } from '../lib/types';
import { CircleLoading, Failure } from './ui';
import { PolicyFooter } from './policy';
import { AxiomBrand } from './axiom-brand';
import './workspace-layout.css';
const UserContext = createContext<User | null>(null);
export function useUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error('Sesi belum tersedia.');
  return user;
}
const customerLinks = [
  ['/dashboard', 'Ringkasan', DashboardSquare01Icon],
  ['/dashboard/transaksi', 'Transaksi', Invoice01Icon],
  ['/dashboard/penarikan', 'Penarikan', Wallet01Icon],
  ['/dashboard/kunci-api', 'Kunci API', Key01Icon],
  ['/dashboard/telegram', 'Axiom Assistant', Shield01Icon],
  ['/dashboard/bantuan', 'Bantuan', UserGroupIcon],
  ['/dashboard/akun', 'Akun', UserGroupIcon],
] as const;
const adminLinks = [
  ['/admin', 'Ringkasan', DashboardSquare01Icon],
  ['/admin/transaksi', 'Transaksi', Invoice01Icon],
  ['/admin/pelanggan', 'Pelanggan', UserGroupIcon],
  ['/admin/penarikan', 'Penarikan', Wallet01Icon],
  ['/admin/komisi', 'Komisi', ChartHistogramIcon],
  ['/admin/audit', 'Audit', Shield01Icon],
  ['/admin/bantuan', 'Bantuan', UserGroupIcon],
  ['/admin/operasional', 'Operasional', ChartHistogramIcon],
] as const;
export default function Workspace({
  kind,
  children,
}: {
  kind: 'customer' | 'admin';
  children: React.ReactNode;
}) {
  const { data, error, loading, refresh } = useResource<{ user: User }>('/api/me');
  const pathname = usePathname();
  const home = kind === 'admin' ? '/admin' : '/dashboard';
  const supportPage = pathname === `${home}/bantuan` || pathname.startsWith(`${home}/bantuan/`);
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [logoutError, setLogoutError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.close();
    const heading = window.document.querySelector('h1')?.textContent;
    window.document.title = heading ? `${heading} — Axiom Payment` : 'Axiom Payment';
  }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 851px)');
    const close = () => {
      if (media.matches) dialog.current?.close();
    };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, []);
  if (loading && !data)
    return (
      <main className="centered">
        <AxiomBrand />
        <CircleLoading label="Memeriksa sesi…" />
      </main>
    );
  if (error || !data)
    return (
      <main className="centered">
        <Failure error={error || new Error('Sesi tidak tersedia.')} retry={refresh} />
      </main>
    );
  if (kind === 'admin' && data.user.role !== 'admin')
    return (
      <main className="centered">
        <h1>Akses administrator diperlukan</h1>
        <Link className="button" href="/dashboard">
          Kembali ke dashboard
        </Link>
      </main>
    );
  const links = kind === 'admin' ? adminLinks : customerLinks;
  const isActive = (href: string) =>
    pathname === href || (href !== home && pathname.startsWith(href + '/'));
  const currentPage = links.find(([href]) => isActive(href))?.[1] || 'Ringkasan';
  const groups = kind === 'admin'
    ? [
        { label: 'Aktivitas', links: adminLinks.slice(0, 5) },
        { label: 'Pengelolaan', links: adminLinks.slice(5) },
      ]
    : [
        { label: 'Pembayaran', links: customerLinks.slice(0, 3) },
        { label: 'Integrasi & layanan', links: customerLinks.slice(3, 6) },
        { label: 'Pengaturan', links: customerLinks.slice(6) },
      ];
  const navigation = (
    <>
      <Link href={kind === 'admin' ? '/admin' : '/dashboard'} className="brand">
        <AxiomBrand />
      </Link>
      <span className="workspace-label">
        {kind === 'admin' ? 'Administrasi' : 'Ruang pelanggan'}
      </span>
      <nav aria-label={kind === 'admin' ? 'Administrasi' : 'Ruang pelanggan'}>
        {groups.map((group) => (
          <div className="workspace-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.links.map(([href, label, icon]) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                onClick={() => dialog.current?.close()}
              >
                <HugeiconsIcon icon={icon} size={19} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link href="/docs">Dokumentasi API</Link>
        {data.user.role === 'admin' && (
          <Link href={kind === 'admin' ? '/dashboard' : '/admin'}>
            {kind === 'admin' ? 'Dashboard pelanggan' : 'Dashboard admin'}
          </Link>
        )}
        <div className="service-note">
          <span className="status-dot" />
          QRIS merchant bersama<small>Data akun tetap terpisah.</small>
        </div>
      </div>
    </>
  );
  return (
    <UserContext.Provider value={data.user}>
      <a className="skip-link" href="#main">
        Lewati navigasi
      </a>
      <div className={supportPage ? 'support-page' : `workspace axiom-workspace workspace-${kind}`}>
        {!supportPage && <aside className="sidebar workspace-sidebar">{navigation}</aside>}
        {!supportPage && (
          <dialog ref={dialog} id="workspace-menu" className="mobile-menu workspace-drawer" aria-label="Menu navigasi">
            <button className="button subtle workspace-menu-close" onClick={() => dialog.current?.close()}>
              Tutup menu
            </button>
            {navigation}
          </dialog>
        )}
        <div className={supportPage ? 'support-page-body' : 'workspace-body'}>
          <header className={supportPage ? 'support-page-header glass-chrome' : 'topbar workspace-topbar glass-chrome'}>
            {supportPage ? (
              <div className="support-page-navigation">
                <Link href={home} className="brand">
                  <AxiomBrand />
                </Link>
                <Link
                  href={home}
                  className="button subtle support-page-back"
                  aria-label={
                    kind === 'admin' ? 'Kembali ke dashboard admin' : 'Kembali ke dashboard'
                  }
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={18} aria-hidden="true" />
                  <span>{kind === 'admin' ? 'Dashboard admin' : 'Dashboard'}</span>
                </Link>
              </div>
            ) : (
              <div className="workspace-location">
                <button
                  aria-label="Buka menu navigasi"
                  aria-haspopup="dialog"
                  aria-controls="workspace-menu"
                  className="icon-button mobile-toggle"
                  onClick={() => dialog.current?.showModal()}
                >
                  <HugeiconsIcon icon={Menu01Icon} size={22} aria-hidden="true" />
                </button>
                <div className="workspace-page-title">
                  <small>{kind === 'admin' ? 'Administrasi' : 'Ruang pelanggan'}</small>
                  <strong>{currentPage}</strong>
                </div>
              </div>
            )}
            <div className="user-menu">
              {kind === 'customer' ? (
                <Link href="/dashboard/akun" className="workspace-account" aria-label={`Pengaturan akun ${data.user.username}`}>
                  <span className="avatar" aria-hidden="true">{data.user.username[0].toUpperCase()}</span>
                  <span className="workspace-account-name">{data.user.username}<small>Akun pelanggan</small></span>
                </Link>
              ) : (
                <div className="workspace-account">
                  <span className="avatar" aria-hidden="true">{data.user.username[0].toUpperCase()}</span>
                  <span className="workspace-account-name">{data.user.username}<small>Administrator</small></span>
                </div>
              )}
              <button
                className="icon-button"
                aria-label="Keluar dari akun"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('/api/auth/logout', { method: 'POST', body: '{}' });
                    router.replace('/login');
                  } catch (e) {
                    setLogoutError(e as Error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <HugeiconsIcon icon={Logout01Icon} size={20} />
              </button>
            </div>
          </header>
          <main
            id="main"
            className={supportPage ? 'support-page-main' : 'workspace-main'}
            tabIndex={-1}
          >
            {logoutError && <Failure error={logoutError} />}
            <div key={pathname}>{children}</div>
          </main>
          {!supportPage && (
            <footer className="workspace-footer glass-chrome">
              <span>Axiom Payment</span>
              <span>Nominal IDR · Waktu WIB</span>
              <PolicyFooter />
            </footer>
          )}
        </div>
      </div>
      {!supportPage && kind === 'customer' && (
        <nav className="workspace-bottom-nav" aria-label="Navigasi utama pelanggan">
          {customerLinks.slice(0, 3).map(([href, label, icon]) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}>
              <HugeiconsIcon icon={icon} size={21} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          <button
            type="button"
            aria-label="Buka semua menu"
            aria-haspopup="dialog"
            aria-controls="workspace-menu"
            className={customerLinks.slice(3).some(([href]) => isActive(href)) ? 'is-active' : undefined}
            onClick={() => dialog.current?.showModal()}
          >
            <HugeiconsIcon icon={Menu01Icon} size={21} aria-hidden="true" />
            <span>Lainnya</span>
          </button>
        </nav>
      )}
    </UserContext.Provider>
  );
}
