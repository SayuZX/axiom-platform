'use client';
import GlobalFeedback from '../components/GlobalFeedback';

import { useEffect, useRef, useState } from 'react';
import { useAdminRouter as useRouter } from '../components/AdminEmbed';
import { errorLabel, request } from '../merchant/components/ui';
import { ErrorDialog } from './AdminDialog';
import MerchantTools from './MerchantTools';

const phases = { start: 'Identitas akun', method: 'Metode verifikasi', otp1: 'Verifikasi identitas', account: 'Pilih akun merchant', otp2: 'Verifikasi WhatsApp', complete: 'Verifikasi selesai' };
const methods = { otp_email: 'Email', otp_sms: 'SMS', otp_wa: 'WhatsApp' };

export default function QrisSettings({ onConnected }) {
  const router = useRouter();
  const [admin, setAdmin] = useState(null);
  const [session, setSession] = useState(null);
  const [flow, setFlow] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [toolsOpened, setToolsOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const action = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setReady(false); setError(''); setSession(null);
    async function load() {
      try {
        const status = await request('/merchant-api/admin/status', { signal: controller.signal });
        if (!controller.signal.aborted) setAdmin(status);
        const value = await request('/merchant-api/session', { signal: controller.signal });
        if (!Object.hasOwn(phases, value.phase)) throw new Error('Tahap verifikasi tidak dikenali. Muat ulang koneksi.');
        if (!controller.signal.aborted) {
          setSession(value);
          setFlow(value.pending_save || value.phase !== 'complete' ? value : null);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(errorLabel(failure));
          if (['admin_required', 'router_admin_required'].includes(failure.code)) router.replace('/login');
        }
      } finally { if (!controller.signal.aborted) setReady(true); }
    }
    void load();
    return () => controller.abort();
  }, [revision, router]);
  useEffect(() => () => action.current?.abort(), []);

  async function perform(operation) {
    if (action.current) return;
    const controller = new AbortController(); action.current = controller;
    setBusy(true); setError(''); setNotice('');
    try { await operation(controller.signal); }
    catch (failure) {
      if (!controller.signal.aborted) {
        setError(errorLabel(failure));
        if (['admin_required', 'router_admin_required'].includes(failure.code)) router.replace('/login');
      }
    } finally {
      if (action.current === controller) { action.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  async function finish(signal) {
    const status = await request('/merchant-api/admin/select', { method: 'POST', body: {}, signal });
    if (signal.aborted) return;
    setAdmin(status); setFlow(null); setSession(null); setExpanded(false);
    setNotice('QRIS terhubung. Pembayaran situs menggunakan akun merchant ini.');
    onConnected?.();
    const value = await request('/merchant-api/session', { signal });
    if (!signal.aborted) setSession(value);
  }
  function openConnection() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (flow?.phase === 'complete' || (flow && flow.phase !== 'start')) return;
    void perform(async (signal) => {
      const value = await request('/merchant-api/session?setup=1', { signal });
      if (!Object.hasOwn(phases, value.phase)) throw new Error('Tahap verifikasi tidak dikenali. Muat ulang koneksi.');
      if (!signal.aborted) setFlow(value);
    });
  }
  function submit(event) {
    event.preventDefault();
    if (!flow || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = flow.phase === 'start' ? { email: String(fields.get('email')).trim(), phone: String(fields.get('phone')).trim(), country_code: String(fields.get('country_code')).trim() } : flow.phase === 'method' ? { method: fields.get('method') } : flow.phase === 'account' ? { account_id: fields.get('account_id') } : { otp: String(fields.get('otp')).trim() };
    void perform(async (signal) => {
      const value = await request(`/merchant-api/login/${flow.phase === 'start' ? 'start' : 'continue'}`, { method: 'POST', body, signal });
      if (!Object.hasOwn(phases, value.phase) || value.phase === 'start') throw new Error('Tahap verifikasi tidak dikenali. Muat ulang koneksi.');
      if (signal.aborted) return;
      form.reset(); setFlow(value);
      if (value.phase === 'complete') await finish(signal);
    });
  }

  const pending = flow?.phase === 'complete';
  const receiving = admin?.configured === true;
  return <section id="qris" className="dash-card dash-block" aria-labelledby="qris-title">
    <div className="dash-row"><div><span className="dash-tag">QRIS SITUS</span><h2 id="qris-title">{receiving ? 'Penerima pembayaran terhubung' : 'Hubungkan QRIS'}</h2></div><button type="button" className="dash-button" disabled={!ready || busy} aria-expanded={expanded} aria-controls="qris-connection" onClick={openConnection}>{expanded ? 'Tutup koneksi' : pending ? 'Lanjutkan koneksi' : receiving ? 'Hubungkan kembali' : 'Hubungkan akun'}</button></div>
    {receiving && <p><strong>{admin.accountLabel || 'Akun merchant situs'}</strong>{session?.merchant_id && !session.pending_save && session.phase === 'complete' && <> · Merchant ID: {session.merchant_id}</>}</p>}
    {!receiving && ready && <p>Gunakan akun GoPay Merchant pemilik situs untuk menerima pembayaran.</p>}
    {!ready && <p role="status">Memuat koneksi QRIS…</p>}
    <ErrorDialog message={error} onClose={() => setError('')}/>
    {error && <button type="button" className="dash-button" disabled={busy || !ready} onClick={() => setRevision((value) => value + 1)}>Muat ulang koneksi</button>}
    {notice && <GlobalFeedback info>{notice}</GlobalFeedback>}
    {pending && !expanded && <p className="dash-muted">Verifikasi sebelumnya selesai, tetapi koneksi belum diselesaikan.</p>}
    <div id="qris-connection" hidden={!expanded}>
      <p className="dash-muted">{receiving ? 'Hubungkan kembali akun pemilik yang sama. Identitas penerima tersimpan tidak diganti.' : 'Verifikasi dilakukan langsung oleh GoPay. Koneksi disimpan otomatis setelah verifikasi berhasil.'}</p>
      {busy && !flow && <p role="status">Memuat tahap verifikasi…</p>}
      {flow && <><h3>{phases[flow.phase]}</h3>{flow.message && <p role="status">{flow.message}</p>}
        {pending ? <button type="button" className="dash-button dash-button-primary" disabled={busy} onClick={() => perform(finish)}>{busy ? 'Menyelesaikan koneksi…' : 'Selesaikan koneksi'}</button> : <form key={flow.phase} className="dash-form" onSubmit={submit}><fieldset disabled={busy || !ready}>
          {flow.phase === 'start' && <><label>Email akun GoPay<input name="email" type="email" autoComplete="email" required maxLength="254"/></label><div className="dash-fields"><label>Kode negara<input name="country_code" defaultValue="62" inputMode="numeric" pattern="[0-9]{1,3}" maxLength="3" required/></label><label>Nomor ponsel terdaftar<input name="phone" type="tel" autoComplete="tel-national" maxLength="16" required/></label></div><p className="dash-muted">Melanjutkan memulai autentikasi GoPay. Jangan bagikan OTP kepada siapa pun.</p></>}
          {flow.phase === 'method' && <label>Metode verifikasi<select name="method" required defaultValue=""><option value="" disabled>Pilih metode</option>{flow.methods?.map((method) => <option key={method} value={method}>{methods[method] || method}</option>)}</select></label>}
          {(flow.phase === 'otp1' || flow.phase === 'otp2') && <><label>Kode OTP<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,8}" minLength="4" maxLength="8" required autoFocus/></label><p className="dash-muted">{flow.phase === 'otp2' ? 'Masukkan kode verifikasi tambahan yang dikirim GoPay melalui WhatsApp.' : 'Masukkan kode yang dikirim GoPay melalui metode pilihan Anda.'}</p></>}
          {flow.phase === 'account' && <label>Akun merchant<select name="account_id" required defaultValue=""><option value="" disabled>Pilih akun Anda</option>{flow.accounts?.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
          <button type="submit" className="dash-button dash-button-primary" disabled={busy || (flow.phase === 'method' && !flow.methods?.length) || (flow.phase === 'account' && !flow.accounts?.length)}>{busy ? 'Memverifikasi…' : flow.phase === 'start' ? 'Hubungkan akun saya' : flow.phase === 'method' ? 'Kirim OTP' : 'Lanjutkan verifikasi'}</button>
        </fieldset></form>}
      </>}
    </div>
    <details className="dash-block" onToggle={(event) => { if (event.currentTarget.open) setToolsOpened(true); }}><summary>Alat pembayaran</summary>{toolsOpened && <MerchantTools configured={receiving} session={session}/>}</details>
  </section>;
}
