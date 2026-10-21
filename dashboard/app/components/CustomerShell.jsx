'use client';
import Skeleton from './Skeleton';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import BrandLogo from './BrandLogo';
import SiteHeader, { useCustomerSession } from './SiteHeader';
import { errorLabel, request } from '../merchant/components/ui';
import GlobalFeedback from './GlobalFeedback';
import Icon from './Icon';
import './registration.css';

export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/buy';
  try {
    const url = new URL(value, 'https://customer.invalid');
    if (url.origin !== 'https://customer.invalid' || url.hash) return '/buy';
    const accountPath = /^\/account(?:\/(?:logs|performance|setup|keys|quota-history|playground|models|integration|status|billing|calculator|updates))?$/.test(url.pathname);
    if (url.pathname === '/buy' || url.pathname === '/playground' || accountPath || (/^\/checkout\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname) && !url.search)) return url.pathname + url.search;
  } catch {}
  return '/buy';
}
export const loginHref = (next) => `/account/login?next=${encodeURIComponent(safeNext(next))}`;
export function CustomerAlert(props) { return <GlobalFeedback {...props}/>; }
export function CustomerHero({ tag, title, children }) {
  return <section className="customer-hero"><div className="wrap"><span className="eyebrow yellow">{tag}</span><h1>{title}</h1><p>{children}</p></div></section>;
}
export default function CustomerShell({ children, view = 'account', session, commerce, next = '/buy' }) {
  return <div className={`axiom-site customer-site view-${view}`} lang="id"><SiteHeader view={view} session={session} commerce={commerce} loginUrl={loginHref(next)}/><main id="main">{children}</main><footer className="customer-footer wrap"><a href="/" aria-label="AXIOM AI beranda"><BrandLogo/></a><nav aria-label="Panduan dan informasi" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px' }}><a href="/docs">Panduan API</a><a href="/account/updates">Pembaruan akun</a><a href="/changelog">Changelog</a><a href="/terms">Ketentuan layanan</a><a href="/privacy">Kebijakan privasi</a></nav></footer></div>;
}
export function CustomerAuth({ register = false }) {
  const router = useRouter();
  const session = useCustomerSession();
  const [next, setNext] = useState('/buy');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalRead, setLegalRead] = useState(false);
  const legalDialog = useRef(null);
  const legalScroll = useRef(null);
  function openLegal() {
    setLegalRead(false);
    legalDialog.current.showModal();
    legalScroll.current.scrollTop = 0;
    if (legalScroll.current.scrollHeight <= legalScroll.current.clientHeight + 2) setLegalRead(true);
  }
  const flight = useRef(false);
  useEffect(() => { setNext(safeNext(new URLSearchParams(window.location.search).get('next'))); }, []);
  async function submit(event) {
    event.preventDefault();
    if (flight.current) return;
    flight.current = true; setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const body = { email: String(form.get('email')).trim(), password: String(form.get('password')) };
    if (register) { body.name = String(form.get('name')).trim(); body.legalAccepted = form.get('legalAccepted') === 'on'; }
    try {
      if ([...body.password].length < 12 || [...body.password].length > 128) throw new Error('Password harus 12–128 karakter.');
      const data = await request(`/account-api/${register ? 'register' : 'login'}`, { method: 'POST', body });
      if (!data.authenticated || !data.customer?.id) throw new Error('Respons akun tidak lengkap. Periksa sesi sebelum melanjutkan.');
      router.replace(next); router.refresh();
    } catch (failure) { setError(errorLabel(failure)); }
    finally { flight.current = false; setBusy(false); }
  }
  if (register) return <CustomerShell session={session} next={next}>
    <div className="registration wrap">
      <section className="registration-card" aria-labelledby="registration-form-title">
        <h1 id="registration-form-title">Buat akun</h1>
        <CustomerAlert>{error || session.error}</CustomerAlert>
        {session.error && <button className="small-button" onClick={session.reload}>Periksa sesi lagi</button>}
        {session.customer ? <div className="registration-session"><CustomerAlert info>Anda masuk sebagai {session.customer.email}. Belum ada invoice baru yang dibuat.</CustomerAlert><a className="button yellow" href={next}>Lanjutkan</a><a className="customer-text-link" href="/account">Kelola akun & pesanan</a></div> : <form className="registration-form" onSubmit={submit} aria-busy={busy}>
          <label htmlFor="customer-name">Nama<input id="customer-name" name="name" autoComplete="name" required maxLength={200} onInput={(event) => event.currentTarget.setCustomValidity([...event.currentTarget.value.trim()].length > 100 ? 'Nama maksimal 100 karakter.' : '')} disabled={busy}/></label>
          <label htmlFor="customer-email">Email<input id="customer-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nama@email.com" disabled={busy}/></label>
          <div className="registration-password-field"><label htmlFor="customer-password">Password</label><div className="registration-password"><input id="customer-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={256} onInput={(event) => { const length = [...event.currentTarget.value].length; event.currentTarget.setCustomValidity(length < 12 || length > 128 ? 'Password harus 12–128 karakter.' : ''); }} aria-describedby="password-help" disabled={busy}/><button type="button" aria-controls="customer-password" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPassword((visible) => !visible)} disabled={busy}>{showPassword ? 'Sembunyikan' : 'Tampilkan'}</button></div><p id="password-help" className="registration-help">Gunakan 12–128 karakter. Jangan gunakan password akun merchant atau admin.</p></div>
          <label className="registration-consent" htmlFor="customer-legal"><input id="customer-legal" name="legalAccepted" type="checkbox" required checked={legalAccepted} onChange={() => legalAccepted ? setLegalAccepted(false) : openLegal()} disabled={busy}/><span>Saya menyetujui <a href="/terms" target="_blank" rel="noopener noreferrer">Ketentuan Layanan</a> dan telah membaca <a href="/privacy" target="_blank" rel="noopener noreferrer">Kebijakan Privasi</a>.</span></label>
          <button className="registration-submit" disabled={busy || session.loading}>{busy ? 'Memproses…' : session.loading ? <Skeleton rows={1} variant="inline" label="Memeriksa sesi…"/> : 'Buat akun'}</button>
          <p className="registration-login">Sudah punya akun? <a href={loginHref(next)}>Masuk di sini</a></p>
        </form>}
      </section>
    </div>
    <dialog ref={legalDialog} className="registration-policy" aria-labelledby="policy-title" onClose={() => document.getElementById('customer-legal')?.focus()}>
      <header><h2 id="policy-title">Ketentuan & privasi</h2><button type="button" aria-label="Tutup ringkasan kebijakan" onClick={() => legalDialog.current.close()}>×</button></header>
      <p className="policy-instruction">Gulir ringkasan hingga selesai untuk melanjutkan.</p>
      <div ref={legalScroll} className="policy-scroll" tabIndex={0} role="region" aria-label="Ringkasan kebijakan" onScroll={event => { const box = event.currentTarget; if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) setLegalRead(true); }}>
        <h3>1. Akun dan akses</h3><p>Gunakan informasi yang benar. Jaga kerahasiaan password dan API key. Akun tidak otomatis memperoleh saldo atau kuota; akses paket mengikuti transaksi yang terverifikasi.</p>
        <h3>2. Penggunaan layanan</h3><p>Gunakan layanan sesuai hukum Indonesia dan hak pihak lain. Jangan melakukan akses tanpa izin, penipuan, gangguan sistem, spam, atau menghindari batas penggunaan.</p>
        <h3>3. Paket dan pembayaran</h3><p>Periksa harga, kuota, model, dan masa berlaku sebelum membeli. Saldo Rupiah berbeda dari token paket. Permintaan yang diproses dapat menggunakan kuota meskipun koneksi terputus. Hak konsumen menurut hukum tetap berlaku.</p>
        <h3>4. Input dan hasil AI</h3><p>Kirim hanya materi yang berhak Anda gunakan. Prompt dan konteks dapat diteruskan kepada penyedia model. Hasil AI dapat keliru; periksa sebelum digunakan. Ketersediaan model bergantung pada layanan terkait.</p>
        <h3>5. Data yang diproses</h3><p>Layanan memproses data akun, sesi, transaksi, kunci terkait, catatan penggunaan, serta percakapan sesuai fitur yang digunakan. Cookie sesi mempertahankan login. Preferensi tertentu disimpan di perangkat.</p>
        <h3>6. Hak privasi</h3><p>Hak akses, koreksi, penghapusan, dan hak lain mengikuti UU Pelindungan Data Pribadi Indonesia. Retensi serta pemrosesan penyedia mengikuti rincian kebijakan lengkap; tidak ada jaminan bahwa seluruh data hanya disimpan di Indonesia.</p>
        <h3>7. Dokumen lengkap</h3><p>Ringkasan ini tidak menggantikan <a href="/terms" target="_blank" rel="noopener noreferrer">Ketentuan Layanan</a> dan <a href="/privacy" target="_blank" rel="noopener noreferrer">Kebijakan Privasi</a>. Persetujuan ini bukan izin menyeluruh untuk pemrosesan data opsional. Waktu dan versi persetujuan dicatat saat pendaftaran berhasil.</p>
      </div>
      <footer><button type="button" disabled={!legalRead} onClick={() => { setLegalAccepted(true); legalDialog.current.close(); }}>Saya sudah membaca</button></footer>
    </dialog>
  </CustomerShell>;
  return <CustomerShell session={session}><CustomerHero tag="AKUN PELANGGAN / AXIOM AI" title={<>Ingin memeriksa<br/>pemakaian API Anda?</>}>Masuk ke akun pelanggan untuk membeli paket, memeriksa pembayaran, dan membuka pesanan Anda.</CustomerHero><div className="customer-auth-layout wrap"><section className="customer-card customer-auth-card"><span className="eyebrow purple">AKSES AKUN ANDA</span><h2>Masuk akun.</h2><CustomerAlert>{error || session.error}</CustomerAlert>{session.error && <button className="small-button" onClick={session.reload}>Periksa sesi lagi</button>}{session.customer ? <><CustomerAlert info>Anda masuk sebagai {session.customer.email}. Belum ada invoice baru yang dibuat.</CustomerAlert><a className="button yellow" href={next}>LANJUTKAN ↗</a><a className="customer-text-link" href="/account">Kelola akun & pesanan</a></> : <form className="customer-form" onSubmit={submit} aria-busy={busy}><label htmlFor="customer-email">Email<input id="customer-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nama@email.com" disabled={busy}/></label><label htmlFor="customer-password">Password<input id="customer-password" name="password" type="password" autoComplete="current-password" required minLength={12} maxLength={256} onInput={(event) => { const length = [...event.currentTarget.value].length; event.currentTarget.setCustomValidity(length < 12 || length > 128 ? 'Password harus 12–128 karakter.' : ''); }} aria-describedby="password-help" disabled={busy}/></label><p id="password-help" className="customer-muted">Gunakan 12–128 karakter. Jangan gunakan password akun merchant atau admin.</p><button className="button yellow" disabled={busy || session.loading}>{busy ? 'MEMPROSES…' : session.loading ? <Skeleton rows={1} variant="inline" label="Memeriksa sesi…" /> : 'MASUK ↗'}</button><p>Belum punya akun? <a className="customer-text-link" href={`/account/register?next=${encodeURIComponent(next)}`}>Daftar akun</a></p></form>}</section><aside className="customer-auth-note"><img src="/ai-mascot.svg" width="150" height="150" alt="Maskot AXIOM AI"/><h2>Bagaimana mendapatkan<br/>API key pertama?</h2><ol className="customer-steps"><li><span>01</span><div><strong>Masuk atau daftar</strong><p>Akun pelanggan menyimpan akses ke pesanan Anda.</p></div></li><li><span>02</span><div><strong>Pilih paket, lalu konfirmasi</strong><p>Masuk tidak otomatis membuat invoice atau pembayaran.</p></div></li><li><span>03</span><div><strong>Bayar lewat QRIS</strong><p>Tidak perlu akun GoPay Merchant. API key tersedia di invoice setelah pembayaran dan aktivasi berhasil.</p></div></li></ol></aside></div></CustomerShell>;
}
