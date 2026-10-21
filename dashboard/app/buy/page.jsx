'use client';
import Skeleton from '../components/Skeleton';
import GlobalFeedback from '../components/GlobalFeedback';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell, { CustomerAlert, loginHref } from '../components/CustomerShell';
import { useCustomerSession } from '../components/SiteHeader';
import { errorLabel, request, rupiah } from '../merchant/components/ui';
import styles from './buy.module.css';

const number = (value) => new Intl.NumberFormat('id-ID').format(value);
const validPrice = (item) => Number.isSafeInteger(item.price) && item.price > 0 && item.currency === 'IDR';
export default function Buy() {
  const router = useRouter();
  const session = useCustomerSession();
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const flight = useRef(false);
  const walletAttempt = useRef(null);
  const [outcome, setOutcome] = useState(null);
  useEffect(() => { if (error || session.error) setOutcome(previous => previous?.kind === 'error' && previous.message === (error || session.error) ? previous : { kind: 'error', title: 'Permintaan belum berhasil', message: error || session.error }); }, [error, session.error]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    request('/commerce-api/packages', { signal: controller.signal }).then((value) => {
      if (typeof value.configured !== 'boolean' || !Array.isArray(value.packages)) throw new Error('Katalog paket belum tersedia.');
      setCatalog(value);
      const linked = new URLSearchParams(window.location.search).get('package');
      setSelected((previous) => value.packages.some((item) => String(item.id) === (previous || linked)) ? previous || linked : '');
    }).catch((failure) => { if (!controller.signal.aborted) { setCatalog(null); setError(errorLabel(failure)); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const chosen = catalog?.packages.find((item) => String(item.id) === selected);
  const payable = catalog?.configured && chosen && validPrice(chosen);
  const next = selected ? `/buy?package=${encodeURIComponent(selected)}` : '/buy';
  function selectPackage(value) {
    setSelected(value);
    window.history.replaceState(null, '', `/buy?package=${encodeURIComponent(value)}`);
  }
  async function logout() {
    setLogoutBusy(true); setError('');
    try { await session.logout(); } catch (failure) { setError(errorLabel(failure)); }
    finally { setLogoutBusy(false); }
  }
  async function buy(event) {
    event.preventDefault();
    if (!payable || flight.current || logoutBusy || session.loading || session.error) return;
    if (!session.customer) { router.push(loginHref(next)); return; }
    flight.current = true; setBusy(true); setError('');
    try {
      const order = await request('/commerce-api/orders', { method: 'POST', body: { package_id: chosen.id } });
      if (typeof order.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order.id)) throw new Error('Respons invoice tidak lengkap. Periksa pesanan di akun sebelum mencoba pembayaran lagi.');
      setOutcome({ kind: 'success', title: 'Invoice QRIS berhasil dibuat', message: `${chosen.name} · ${rupiah(chosen.price)}. Invoice belum dibayar. Lanjutkan untuk melihat QRIS.`, href: `/checkout/${encodeURIComponent(order.id)}`, action: 'Lanjut bayar' });
    } catch (failure) {
      if (failure.status === 401) { session.reload(); router.push(loginHref(next)); }
      else { setError(errorLabel(failure)); setOutcome({ kind: 'error', title: 'Periksa hasil permintaan', message: errorLabel(failure), href: '/account/billing', action: 'Periksa pesanan' }); }
    } finally { flight.current = false; setBusy(false); }
  }
  async function buyWithBalance() {
    if (!chosen || !validPrice(chosen) || flight.current || logoutBusy || session.loading || session.error) return;
    if (!session.customer) { router.push(loginHref(next)); return; }
    if (walletAttempt.current?.package_id !== chosen.id) walletAttempt.current = {package_id:chosen.id,request_id:crypto.randomUUID()};
    flight.current=true;setBusy(true);setError('');
    try {
      const order=await request('/wallet-api/purchase',{method:'POST',body:walletAttempt.current});
      if(!order.id)throw new Error('Periksa daftar pesanan sebelum mengulangi pembelian saldo.');
      window.dispatchEvent(new Event('wallet-updated'));
      setOutcome({ kind: 'success', title: 'Pesanan saldo berhasil diproses', message: `${chosen.name} · ${rupiah(chosen.price)}. Buka pesanan untuk melihat status aktivasi paket.`, href: `/checkout/${encodeURIComponent(order.id)}`, action: 'Lihat pesanan' });
    } catch(failure) { setError(errorLabel(failure)); setOutcome({ kind: 'error', title: 'Periksa hasil pembelian', message: errorLabel(failure), href: '/account/billing', action: 'Periksa pesanan' }); if(failure.status===401)router.push(loginHref(next)); }
    finally{flight.current=false;setBusy(false);}
  }
  return <CustomerShell view="buy" session={session} next={next} commerce={loading ? 'loading' : !catalog ? 'unavailable' : catalog.configured ? 'configured' : 'unconfigured'}>
    <div className={`${styles.store} customer-store wrap`}>
      <header className={styles.heading}><div><h1>Pilih paket Anda</h1><p>Bandingkan kuota, pilih paket, lalu tinjau pembayaran.</p></div><a className="small-button" href="/pricing">Model & harga</a></header>
      {session.error && <button className="small-button" onClick={session.reload}>Periksa sesi lagi</button>}
      {!loading && !catalog && <button className="small-button" onClick={() => setReload((value) => value + 1)}>Muat ulang katalog</button>}
      {loading && <Skeleton rows={4} variant="table" label="Memuat paket…" />}
      {catalog && !catalog.configured && <CustomerAlert info>Pembayaran situs belum diaktifkan. Belum ada QRIS atau pembayaran yang dibuat.</CustomerAlert>}
      {catalog?.packages.length === 0 && <CustomerAlert info>Belum ada paket token tersedia. Silakan periksa kembali nanti.</CustomerAlert>}
      <div className={styles.layout}><fieldset className={styles.packages} disabled={busy || logoutBusy}><legend className="customer-sr-only">Pilih satu paket token</legend>{catalog?.packages.map((item, index) => {
        const valid = validPrice(item);
        const active = selected === String(item.id);
        return <label key={item.id} className={`${styles.package} ${item.isPopular ? styles.popular : ''} ${active ? styles.selected : ''} ${!valid ? styles.unavailable : ''}`}>
          <span className={styles.packageTop}><span className={item.isPopular ? styles.popularBadge : undefined}>{item.badge || (item.isPopular ? 'Pilihan populer' : 'Paket token')}</span><input type="radio" name="package" value={item.id} checked={active} onChange={() => selectPackage(String(item.id))} disabled={!valid} aria-label={`Pilih paket ${item.name}`}/></span>
          <span className="customer-package-name">{item.name}</span><span className="customer-package-description">{item.description || 'Paket akses API AXIOM AI.'}</span><strong className="customer-price">{valid ? rupiah(item.price) : 'Harga belum tersedia'}</strong>
          {valid && Number.isSafeInteger(item.tokenLimit) && item.tokenLimit > 0 && <span className="customer-muted">Rp{number(Math.round(item.price * 100000000 / item.tokenLimit) / 100)} / 1 juta token · bayar sekali per paket</span>}
          <span className="customer-package-facts"><span>Token paket<strong>{Number.isSafeInteger(item.tokenLimit) && item.tokenLimit >= 0 ? number(item.tokenLimit) : 'Belum dipublikasikan'}</strong></span><span>Masa berlaku<strong>{Number.isSafeInteger(item.validDays) && item.validDays > 0 ? `${item.validDays} hari` : 'Belum dipublikasikan'}</strong></span>{Number.isSafeInteger(item.rpmLimit) && <span>Request / menit<strong>{item.rpmLimit === 0 ? 'Tanpa batas khusus' : number(item.rpmLimit)}</strong></span>}</span>
          {Array.isArray(item.features) && item.features.length > 0 && <span className="customer-package-features">{item.features.filter((feature) => typeof feature === 'string').map((feature, i) => <span key={i}>✓ {feature}</span>)}</span>}
          <span className={styles.modelPolicy}>Model: {!item.allowedModels?.length || item.allowedModels.includes('*') ? 'Semua model yang tersedia' : item.allowedModels.join(', ')}{item.blockedModels?.length ? ` · Diblokir: ${item.blockedModels.join(', ')}` : ''}</span>
          <span className={styles.selection}>{active ? '✓ Terpilih' : valid ? 'Pilih paket' : 'Belum tersedia'}</span>
        </label>;
      })}</fieldset>
      <aside id="ringkasan-pesanan" className={`${styles.summary} customer-summary`}><h2>Ringkasan pesanan</h2>
        {session.loading ? <Skeleton rows={2} label="Memeriksa akun pelanggan…" /> : session.customer ? <div className="customer-identity"><span className="micro-label">MASUK SEBAGAI</span><strong>{session.customer.name}</strong><span>{session.customer.email}</span><div><a className="customer-text-link" href="/account">Akun & pesanan</a><button className="customer-text-button" disabled={busy || logoutBusy} onClick={logout}>{logoutBusy ? 'Keluar…' : 'Keluar'}</button></div></div> : !session.error && <p>Masuk atau daftar akun pelanggan untuk melanjutkan. Invoice tersimpan di akun Anda, bukan hanya di tab ini.</p>}
        <form onSubmit={buy} aria-busy={busy}><dl className="customer-summary-details"><div><dt>Paket</dt><dd>{chosen?.name || 'Pilih paket dahulu'}</dd></div><div><dt>Total</dt><dd>{chosen ? rupiah(chosen.price) : '—'}</dd></div></dl>
          {!session.loading && !session.error && !session.customer ? <a className="button yellow" href={loginHref(next)}>Masuk untuk melanjutkan</a> : <button className="button yellow" disabled={loading || !payable || busy || logoutBusy || session.loading || !!session.error}>{busy ? 'Membuat invoice…' : catalog && !catalog.configured ? 'Pembayaran belum tersedia' : 'Lanjut dengan QRIS'}</button>}
          {session.customer && <button className="button white" type="button" onClick={async () => { if (await window.axiomConfirm({message: `Beli ${chosen?.name} seharga ${chosen ? rupiah(chosen.price) : ''} menggunakan saldo? Saldo akan langsung dipotong setelah pembelian berhasil.`})) void buyWithBalance(); }} disabled={loading || !chosen || busy || logoutBusy || !!session.error}>Gunakan saldo</button>}
          <p className="customer-muted">{session.customer ? 'QRIS membuat invoice untuk dibayar di aplikasi. Beli dengan Saldo langsung mendebit harga paket satu kali dari saldo situs.' : 'Masuk tidak otomatis membuat invoice. Setelah kembali, periksa pilihan paket dan konfirmasi sendiri.'}</p>
        </form><a className="customer-text-link" href="/account/billing">Isi saldo & riwayat tagihan</a>
      </aside></div>
      {chosen && <a className={styles.reviewMobile} href="#ringkasan-pesanan">Tinjau pilihan · {chosen.name}</a>}
      <details className={styles.terms}><summary>Ketentuan paket</summary><p>Token input dan output memakai kuota paket, termasuk input cache yang dilaporkan router. Saldo Rupiah digunakan untuk membeli paket; bukan kuota token.</p><p>Masa aktif dimulai setelah aktivasi. RPM adalah batas permintaan per menit, bukan jaminan kapasitas provider. Ketersediaan model mengikuti katalog; blokir model mengalahkan izin.</p><a href={chosen ? `/calculator?package=${encodeURIComponent(chosen.id)}` : '/calculator'}>Hitung kebutuhan token</a></details>
      {outcome && <GlobalFeedback info={outcome.kind === 'success'}><h2>{outcome.title}</h2><p>{outcome.message}</p>{outcome.href && <a href={outcome.href}>{outcome.action}</a>}</GlobalFeedback>}
    </div>
  </CustomerShell>;
}
