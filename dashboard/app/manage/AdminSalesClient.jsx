'use client';
import GlobalFeedback from '../components/GlobalFeedback';

import { useEffect, useRef, useState } from 'react';
import { useAdminRouter as useRouter } from '../components/AdminEmbed';
import DashboardShell from '../components/DashboardShell';
import AdminDialog, { ErrorDialog } from './AdminDialog';
import { dateLabel, errorLabel, request, rupiah } from '../merchant/components/ui';
import QrisSettings from './QrisSettings';
import BillingOverview, { BillingIcon, BillingSkeleton } from './BillingOverview';

const base = '/merchant-api/billing';
const states = [['creating', 'Pembuatan invoice'], ['pending', 'Menunggu pembayaran'], ['unknown', 'Perlu diperiksa'], ['settlement', 'Lunas'], ['cancel', 'Dibatalkan'], ['expire', 'Kedaluwarsa'], ['deny', 'Ditolak'], ['failure', 'Gagal']];
const salesTabs = [['packages', 'Paket token'], ['keys', 'Key pelanggan'], ['accounts', 'Akun provider'], ['settings', 'Pesan API']];
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('id-ID') : 'Tidak tersedia';
const modelList = (value) => [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
const modelsLabel = (value, blocked = false) => value == null || (Array.isArray(value) && !value.length) ? (blocked ? 'Tidak ada' : 'Semua model') : Array.isArray(value) ? (value.includes('*') ? 'Semua model' : value.join(', ')) : 'Tidak tersedia';
const newPackage = { name: '', description: '', tokenAmount: '', price: '', rpmLimit: 0, tpmLimit: 0, validityDays: 30, allowedModels: null, blockedModels: null, features: [], badge: '', isActive: true, isPopular: false, sortOrder: 0 };

function MessageSettings() {
  const [messages, setMessages] = useState({ key_disabled: '', quota_exceeded: '', ai_error: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { request('/merchant-api/router-messages').then((data) => setMessages({ key_disabled: data.apiMessageSettings?.key_disabled || '', quota_exceeded: data.apiMessageSettings?.quota_exceeded || '', ai_error: data.apiMessageSettings?.ai_error || '' })).catch((failure) => setError(errorLabel(failure))).finally(() => setLoading(false)); }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await request('/merchant-api/router-messages', { method: 'POST', body: messages }); setNotice('Pesan custom berhasil disimpan.'); }
    catch (failure) { setError(errorLabel(failure)); }
    finally { setBusy(false); }
  }
  const fields = [['key_disabled', 'API key dinonaktifkan', 'API key kamu sedang dinonaktifkan. Silakan hubungi administrator atau perbarui paket kamu.'], ['quota_exceeded', 'Kuota token habis', 'Kuota token kamu telah habis. Silakan isi ulang atau perbarui paket kamu.'], ['ai_error', 'AI error / maintenance', 'Layanan AI sedang mengalami gangguan atau maintenance. Silakan coba lagi beberapa saat lagi.']];
  return <section className="dash-card" aria-labelledby="router-message-settings"><div className="dash-row"><div><h2 id="router-message-settings">Pesan API & maintenance</h2><p className="dash-muted">Pesan ini tampil saat key pelanggan dinonaktifkan, kuota paket habis, atau layanan AI error.</p></div></div>{loading && <p role="status" className="dash-muted">Memuat pesan…</p>}{error && <Alert>{error}</Alert>}{!loading && <form className="dash-form" onSubmit={save}><p className="dash-muted">Kosongkan untuk memakai default. Placeholder: <code>{'{package}'}</code>, <code>{'{remaining}'}</code>, <code>{'{error}'}</code>.</p>{fields.map(([key, label, placeholder]) => <label className="dash-field" key={key}>{label}<textarea rows="3" value={messages[key]} placeholder={placeholder} onChange={(event) => setMessages({ ...messages, [key]: event.target.value })}/></label>)}<div className="dash-actions"><button className="dash-button dash-button-primary" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pesan'}</button>{notice && <span className="dash-muted" role="status">{notice}</span>}</div></form>}</section>;
}

function Alert({ children, info = false }) { return <GlobalFeedback info={info}>{children}</GlobalFeedback>; }
function Status({ status }) { return <span className={`dash-status dash-status-${states.some(([id]) => id === status) ? status : 'unknown'}`}>{states.find(([id]) => id === status)?.[1] || 'Status belum tersedia'}</span>; }
function useResource(path, revision, router) {
  const [state, setState] = useState({ data: null, error: '', loading: false });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState({ data: null, error: '', loading: true });
    request(base + path, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ data, error: '', loading: false });
    }).catch((failure) => {
      if (!controller.signal.aborted) {
        setState({ data: null, error: errorLabel(failure), loading: false });
        if (failure.code === 'admin_required') router.replace('/login');
      }
    });
    return () => controller.abort();
  }, [path, revision, router]);
  return state;
}
function ResourceState({ resource, retry }) {
  return <><Alert>{resource.error}</Alert>{resource.error && <button type="button" className="dash-button" onClick={retry}>Coba muat lagi</button>}{resource.loading && <p role="status" className="dash-muted">Memuat data…</p>}</>;
}
function integer(form, field, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const raw = String(form.get(field) ?? '').trim();
  const value = Number(raw);
  if (!raw || !Number.isSafeInteger(value) || value < min || value > max) throw Object.assign(new Error(`${label} harus berupa bilangan bulat antara ${min.toLocaleString('id-ID')} dan ${max.toLocaleString('id-ID')}.`), { field });
  return value;
}
function invalidField(form, failure) {
  const input = form.elements.namedItem(failure.field);
  if (!input) return;
  input.setCustomValidity(errorLabel(failure));
  input.reportValidity();
  input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
}
function ModelField({ value, blocked }) {
  return <><label>Model yang diizinkan (koma atau baris baru)<textarea name="allowedModels" rows="3" defaultValue={value?.join('\n') || ''}/><span>Kosong atau * berarti semua model.</span></label><label>Model yang diblokir (koma atau baris baru)<textarea name="blockedModels" rows="3" defaultValue={blocked?.join('\n') || ''}/><span>Kosong berarti tidak ada blokir; * memblokir semua model. Blokir selalu menang atas izin. Gunakan ID dari <a className="dash-text-link" href="/dashboard?admin=models">katalog model</a>, ID tanpa provider, atau pola *; bukan potongan nama.</span></label></>;
}
function PackageForm({ item, busy, save, close }) {
  function submit(event) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const allowedModels = modelList(String(form.get('allowedModels')));
      const blockedModels = modelList(String(form.get('blockedModels')));
      const name = String(form.get('name')).trim();
      if (!name) throw Object.assign(new Error('Nama paket wajib diisi.'), { field: 'name' });
      save({ name, description: String(form.get('description')).trim(), tokenAmount: integer(form, 'tokenAmount', 'Jumlah token', 1), price: integer(form, 'price', 'Harga IDR', 1, 10000000), rpmLimit: integer(form, 'rpmLimit', 'RPM'), tpmLimit: integer(form, 'tpmLimit', 'TPM'), validityDays: integer(form, 'validityDays', 'Masa berlaku', 1, 3650), allowedModels: allowedModels.length ? allowedModels : null, blockedModels: blockedModels.length ? blockedModels : null, features: String(form.get('features')).split('\n').map((line) => line.trim()).filter(Boolean), badge: String(form.get('badge')).trim(), isActive: form.has('isActive'), isPopular: form.has('isPopular'), sortOrder: integer(form, 'sortOrder', 'Urutan', 0, 1000000) });
    } catch (failure) { invalidField(event.currentTarget, failure); }
  }
  return <section className="dash-card dash-editor" aria-labelledby="package-editor-title"><h2 id="package-editor-title">{item.id ? 'Edit paket' : 'Tambah paket'}</h2>{item.id && <p className="dash-muted">ID: {item.id}</p>}<p>Perubahan hanya berlaku untuk pembelian berikutnya. Snapshot paket pesanan yang sudah dibuat tetap dipertahankan.</p>
    <form className="dash-form" onSubmit={submit}><fieldset disabled={busy}>
      <label>Nama paket<input name="name" required maxLength="160" defaultValue={item.name}/></label>
      <label>Deskripsi<textarea name="description" rows="3" maxLength="3000" defaultValue={item.description || ''}/></label>
      <div className="dash-fields"><label>Jumlah token<input name="tokenAmount" type="number" min="1" step="1" required defaultValue={item.tokenAmount}/></label><label>Harga (IDR)<input name="price" type="number" min="1" max="10000000" step="1" required defaultValue={item.price}/></label><label>Batas RPM<input name="rpmLimit" type="number" min="0" step="1" required defaultValue={item.rpmLimit}/></label><label>Batas TPM<input name="tpmLimit" type="number" min="0" step="1" required defaultValue={item.tpmLimit}/></label><label>Masa berlaku (hari)<input name="validityDays" type="number" min="1" max="3650" step="1" required defaultValue={item.validityDays}/></label><label>Urutan tampil<input name="sortOrder" type="number" min="0" max="1000000" step="1" required defaultValue={item.sortOrder}/></label></div>
      <p className="dash-muted">RPM / TPM bernilai 0 berarti tanpa batas khusus pada key.</p><ModelField value={item.allowedModels} blocked={item.blockedModels}/>
      <label>Fitur (satu per baris)<textarea name="features" rows="4" defaultValue={item.features.join('\n')}/></label><label>Badge<input name="badge" maxLength="100" defaultValue={item.badge || ''}/></label>
      <label className="dash-check"><input type="checkbox" name="isActive" defaultChecked={item.isActive}/>Aktif untuk pembelian</label><label className="dash-check"><input type="checkbox" name="isPopular" defaultChecked={item.isPopular}/>Tandai populer</label>
      <div className="dash-actions"><button className="dash-button dash-button-primary" type="submit">{busy ? 'Menyimpan…' : 'Simpan paket'}</button><button type="button" className="dash-button" onClick={close}>Batal edit</button></div>
    </fieldset></form></section>;
}
function RequestUsage({ usage, periods }) {
  return <dl>{periods.map(([period, label]) => {
    const item = usage?.[period];
    return <div key={period}><dt>{label}</dt><dd>{item ? <>{count(item.used)} terpakai / {item.limit === 0 ? 'Tanpa batas tambahan' : count(item.limit)} · Sisa: {item.remaining === null ? 'Tanpa batas tambahan' : count(item.remaining)}<br/>Reset: {item.resetAt ? new Date(item.resetAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB' : 'Belum dimulai / tidak aktif'}</> : 'Tidak tersedia'}</dd></div>;
  })}</dl>;
}
function RequestExplanation() {
  return <p className="dash-muted">Batas ini menghitung percobaan inferensi yang diterima, termasuk jika upstream kemudian error; bukan token atau potongan streaming. Nilai 0 menonaktifkan batas tambahan. Mengubah batas tidak mereset pemakaian. Jendela 3 jam dimulai dari request pertama yang diterima saat batas aktif; mingguan reset Senin pukul 00.00 WIB. Batas harian akun provider dipakai bersama semua key dan reset pukul 00.00 WIB.</p>;
}
function AccountForm({ item, busy, save, close }) {
  function submit(event) {
    event.preventDefault();
    try { save({ dailyRequestLimit: integer(new FormData(event.currentTarget), 'dailyRequestLimit', 'Batas request harian') }); }
    catch (failure) { invalidField(event.currentTarget, failure); }
  }
  return <section className="dash-card dash-editor" aria-labelledby="account-editor-title"><h2 id="account-editor-title">Edit batas akun provider</h2><p>{item.provider} — {item.name || 'Tanpa nama'}</p><p className="dash-muted">ID: {item.id}</p><RequestExplanation/><RequestUsage usage={item.requestUsage} periods={[["daily", "Request harian"]]}/><form className="dash-form" onSubmit={submit}><fieldset disabled={busy}><label>Batas request harian<input name="dailyRequestLimit" type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" required defaultValue={item.dailyRequestLimit ?? 0}/></label><div className="dash-actions"><button type="submit" className="dash-button dash-button-primary">{busy ? 'Menyimpan…' : 'Simpan batas akun'}</button><button type="button" className="dash-button" onClick={close}>Batal edit</button></div></fieldset></form></section>;
}
function KeyForm({ item, connections = [], busy, save, close }) {
  function submit(event) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const expiry = String(form.get('expiresAt')).trim();
      if (expiry && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(expiry) || !Number.isFinite(Date.parse(expiry)))) throw Object.assign(new Error('Gunakan tanggal ISO 8601 lengkap dengan zona waktu, misalnya 2027-01-31T23:59:00+07:00.'), { field: 'expiresAt' });
      const allowedModels = modelList(String(form.get('allowedModels')));
      const blockedModels = modelList(String(form.get('blockedModels')));
      save({ providerConnectionId: String(form.get('providerConnectionId') || '') || null, tokenLimit: integer(form, 'tokenLimit', 'Kuota token'), rpmLimit: integer(form, 'rpmLimit', 'RPM'), tpmLimit: integer(form, 'tpmLimit', 'TPM'), threeHourRequestLimit: integer(form, 'threeHourRequestLimit', 'Batas request 3 jam'), weeklyRequestLimit: integer(form, 'weeklyRequestLimit', 'Batas request mingguan'), expiresAt: expiry ? new Date(expiry).toISOString() : null, blockedModels: blockedModels.length ? blockedModels : null, allowedModels: allowedModels.length ? allowedModels : null });
    } catch (failure) { invalidField(event.currentTarget, failure); }
  }
  return <section className="dash-card dash-editor" aria-labelledby="key-editor-title"><h2 id="key-editor-title">Edit batas key</h2><p>{item.name} · {item.customerEmail || 'Email tidak tersedia'}</p><p className="dash-muted">ID: {item.id}. Kuota total, bukan tambahan token. Pemakaian yang sudah tercatat tidak direset.</p><form className="dash-form" onSubmit={submit}><fieldset disabled={busy}>
    <label>Arahkan API key ke akun provider<select name="providerConnectionId" defaultValue={item.providerConnectionId || ''}><option value="">Otomatis — semua akun tersedia</option>{item.providerConnectionId && !connections.some(account => account.id === item.providerConnectionId) && <option value={item.providerConnectionId}>Akun tidak tersedia ({item.providerConnectionId})</option>}{connections.filter(account => account.isActive || account.id === item.providerConnectionId).map(account => <option key={account.id} value={account.id}>{account.provider} — {account.name || 'Tanpa nama'} ({account.id.slice(-8)}){account.isActive ? '' : ' — nonaktif'}</option>)}</select><span>Pilih akun Codex untuk mengunci key ke akun tersebut. Jika limit atau nonaktif, key tidak berpindah akun.</span></label>
    <div className="dash-fields"><label>Kuota total token<input type="number" name="tokenLimit" min="0" step="1" required defaultValue={item.tokenLimit}/></label><label>Batas RPM<input type="number" name="rpmLimit" min="0" step="1" required defaultValue={item.rpmLimit}/></label><label>Batas TPM<input type="number" name="tpmLimit" min="0" step="1" required defaultValue={item.tpmLimit}/></label></div><p className="dash-muted">Nilai 0 berarti tanpa batas khusus pada key.</p>
    <div className="dash-fields"><label>Batas request per 3 jam<input type="number" name="threeHourRequestLimit" min="0" max={Number.MAX_SAFE_INTEGER} step="1" required defaultValue={item.threeHourRequestLimit ?? 0}/></label><label>Batas request mingguan<input type="number" name="weeklyRequestLimit" min="0" max={Number.MAX_SAFE_INTEGER} step="1" required defaultValue={item.weeklyRequestLimit ?? 0}/></label></div><RequestExplanation/><RequestUsage usage={item.requestUsage} periods={[["threeHour", "Request 3 jam"], ["weekly", "Request mingguan"]]}/>
    <label>Kedaluwarsa (ISO 8601 dengan zona waktu)<input name="expiresAt" type="text" defaultValue={item.expiresAt || ''} placeholder="2027-01-31T23:59:00+07:00"/><span>Kosong berarti tanpa batas waktu. Status aktif key tidak diubah oleh form ini.</span></label><ModelField value={item.allowedModels} blocked={item.blockedModels}/>
    <div className="dash-actions"><button type="submit" className="dash-button dash-button-primary">{busy ? 'Menyimpan…' : 'Simpan batas key'}</button><button type="button" className="dash-button" onClick={close}>Batal edit</button></div>
  </fieldset></form></section>;
}

export default function AdminSalesClient({ section }) {
  return <DashboardShell role="admin" title={section === 'sales' ? 'Jual API' : 'Billing'} description={section === 'sales' ? 'Kelola paket token, key pelanggan, dan batas akun provider.' : 'Pantau pesanan, pembayaran, dan koneksi QRIS situs.'}><SalesContent section={section}/></DashboardShell>;
}
function SalesContent({ section }) {
  const router = useRouter();
  const billing = section === 'billing';
  const [tab, setTab] = useState('packages');
  const [billingTab, setBillingTab] = useState(() => typeof window !== 'undefined' && window.location.hash === '#qris' ? 'qris' : 'transactions');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const action = useRef(null);
  const focusTarget = useRef(null);
  const stats = useResource(billing ? '/stats' : null, revision, router);
  const packages = useResource(!billing && tab === 'packages' ? '/packages' : null, revision, router);
  const orders = useResource(billing ? `/orders?page=${page}&status=${encodeURIComponent(status)}` : null, revision, router);
  const keys = useResource(!billing && (tab === 'keys' || tab === 'accounts') ? '/keys' : null, revision, router);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => { if (editor) { focusTarget.current?.scrollIntoView({ block: 'nearest' }); focusTarget.current?.focus(); } }, [editor]);
  function selectTab(value) { setTab(value); setEditor(null); setConfirmation(null); setError(''); setNotice(''); }
  function navigateTabs(event, index) {
    const next = event.key === 'ArrowRight' ? (index + 1) % salesTabs.length : event.key === 'ArrowLeft' ? (index + salesTabs.length - 1) % salesTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? salesTabs.length - 1 : null;
    if (next === null || busy) return;
    event.preventDefault(); selectTab(salesTabs[next][0]); document.getElementById(`sales-tab-${salesTabs[next][0]}`)?.focus();
  }
  function filterOrders(value) { setStatus(value); setPage(1); setConfirmation(null); setBillingTab('transactions'); }
  function navigateBillingTabs(event) {
    if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'transactions' : event.key === 'End' ? 'qris' : billingTab === 'transactions' ? 'qris' : 'transactions';
    setBillingTab(next); document.getElementById(`billing-tab-${next}`)?.focus();
  }
  async function mutate(path, body, success) {
    if (action.current) return;
    const controller = new AbortController(); action.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request(base + path, { method: 'POST', body, signal: controller.signal });
      if (!controller.signal.aborted) {
        setEditor(null); setConfirmation(null);
        const state = result.state || result.payment?.status || result.order?.state;
        setNotice(success + (state ? ` Status provider: ${states.find(([id]) => id === state)?.[1] || state}.` : ''));
      }
    } catch (failure) {
      if (!controller.signal.aborted) { setError(errorLabel(failure)); if (failure.code === 'admin_required') router.replace('/login'); }
    } finally {
      if (action.current === controller) { action.current = null; if (!controller.signal.aborted) { setBusy(false); refresh(); } }
    }
  }
  function confirm(kind, item) { setEditor(null); setError(''); setNotice(''); setConfirmation({ kind, item }); }
  function edit(item) { setConfirmation(null); setError(''); setNotice(''); setEditor(item); }

  return <div className={`dash-sales${billing ? ' billing-workspace' : ''}`}>
    <div className="dash-row"><nav className="dash-actions" aria-label="Tautan pengelolaan">{billing ? <a className="dash-button" href="/dashboard?admin=api-sales">Kelola paket & key</a> : <><a className="dash-button" href="/buy">Halaman pembeli</a><a className="dash-button" href="/dashboard/endpoint">Terbitkan key manual</a></>}</nav><button className="dash-button" type="button" disabled={busy} onClick={refresh}>Muat ulang</button></div>
    {!billing && <div className="dash-tabs" role="tablist" aria-label="Pengelolaan penjualan API">{salesTabs.map(([id, label], index) => <button key={id} id={`sales-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`sales-panel-${id}`} tabIndex={tab === id ? 0 : -1} disabled={busy} className={`dash-button ${tab === id ? 'dash-button-primary' : ''}`} onClick={() => selectTab(id)} onKeyDown={(event) => navigateTabs(event, index)}>{label}</button>)}</div>}
    <Alert>{error}</Alert><Alert info>{notice}</Alert>
    <div ref={focusTarget} tabIndex={-1}>
      {confirmation && <AdminDialog title={confirmation.kind === 'package' ? 'Hapus paket ini?' : confirmation.kind === 'order' ? 'Batalkan pesanan ini?' : 'Nonaktifkan key ini?'} pending={busy} onClose={() => setConfirmation(null)} confirmLabel={confirmation.kind === 'package' ? 'Ya, hapus paket' : confirmation.kind === 'order' ? 'Ya, batalkan pesanan' : 'Ya, nonaktifkan key'} onConfirm={async () => {
        const { kind, item } = confirmation;
        if (kind === 'package') await mutate(`/packages/${encodeURIComponent(item.id)}/delete`, {}, 'Paket berhasil dihapus.');
        else if (kind === 'order') await mutate(`/orders/${encodeURIComponent(item.id)}/cancel`, {}, 'Permintaan pembatalan selesai diperiksa. Muat ulang pesanan untuk status terakhir.');
        else await mutate(`/keys/${encodeURIComponent(item.id)}`, { isActive: false }, 'Key berhasil dinonaktifkan.');
        setConfirmation(null);
      }}><p>{confirmation.item.name || confirmation.item.id}</p><p>{confirmation.kind === 'package' ? 'Paket dihapus dari katalog. Snapshot pesanan yang sudah dibuat tidak berubah.' : confirmation.kind === 'order' ? 'Pembatalan dikirim ke provider. Jika pembayaran sudah diterima, status lunas tetap berlaku; tindakan ini bukan refund.' : 'Akses key dihentikan. Catatan key tetap disimpan agar pesanan lunas tidak menerbitkan key pengganti.'}</p></AdminDialog>}
      {editor && (tab === 'packages' ? <PackageForm key={editor.id || 'new'} item={editor} busy={busy} close={() => setEditor(null)} save={(body) => mutate(editor.id ? `/packages/${encodeURIComponent(editor.id)}` : '/packages', body, 'Paket berhasil disimpan.')}/> : tab === 'accounts' ? <AccountForm key={editor.id} item={editor} busy={busy} close={() => setEditor(null)} save={(body) => mutate(`/accounts/${encodeURIComponent(editor.id)}`, body, 'Batas request akun berhasil disimpan.')}/> : <KeyForm key={editor.id} item={editor} connections={keys.data?.connections || []} busy={busy} close={() => setEditor(null)} save={(body) => mutate(`/keys/${encodeURIComponent(editor.id)}`, body, 'Pengaturan akun dan batas key berhasil disimpan.')}/>)}
    </div>
    {billing ? <>
      <Alert>{stats.error}</Alert>{stats.error && <button type="button" className="dash-button" onClick={refresh}>Coba muat ringkasan lagi</button>}
      <BillingOverview snapshot={stats.data} loading={stats.loading || (!stats.data && !stats.error)} states={states} status={status} onStatus={filterOrders} busy={busy}/>
      <div className="billing-tabs" role="tablist" aria-label="Pengelolaan billing" style={{ '--billing-tab-index': billingTab === 'qris' ? 1 : 0 }}><span className="billing-tab-indicator" aria-hidden="true"/>{[['transactions', 'Transaksi'], ['qris', 'QRIS']].map(([id, label]) => <button key={id} id={`billing-tab-${id}`} type="button" role="tab" aria-selected={billingTab === id} aria-controls={`billing-panel-${id}`} tabIndex={billingTab === id ? 0 : -1} disabled={busy} onClick={() => setBillingTab(id)} onKeyDown={navigateBillingTabs}>{label}</button>)}</div>
      <div id="billing-panel-qris" role="tabpanel" aria-labelledby="billing-tab-qris" tabIndex={0} hidden={billingTab !== 'qris'}><QrisSettings onConnected={refresh}/></div>
      <div id="billing-panel-transactions" role="tabpanel" aria-labelledby="billing-tab-transactions" tabIndex={0} hidden={billingTab !== 'transactions'}>
      <section className="dash-card billing-orders" aria-labelledby="orders-title" aria-busy={busy || orders.loading}><div className="billing-orders-heading"><div><h2 id="orders-title">Pesanan & pembayaran</h2><p className="dash-muted">Pantau pembayaran dan pemenuhan setiap pesanan.</p></div><label className="dash-filter">Filter status<select value={status} disabled={busy} onChange={(event) => filterOrders(event.target.value)}><option value="">Semua status</option>{states.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div><Alert>{orders.error}</Alert>{orders.error && <button type="button" className="dash-button" onClick={refresh}>Coba muat pesanan lagi</button>}{(orders.loading || (!orders.data && !orders.error)) && <BillingSkeleton table/>}
        {orders.data && <>{orders.data.orders.length ? <div className="dash-table-wrap" tabIndex={0} role="region" aria-label="Daftar pesanan, gulir ke kanan untuk kolom lainnya"><table className="dash-table"><caption className="dash-sr-only">Pesanan checkout AXIOM</caption><thead><tr><th scope="col">Pesanan / pelanggan</th><th scope="col">Nominal IDR</th><th scope="col">Status / pemenuhan</th><th scope="col">Waktu</th><th scope="col">Tindakan</th></tr></thead><tbody>{orders.data.orders.map((item) => <tr key={item.id}>
          <td><strong>{item.package_name || (item.kind === 'topup' ? 'Isi saldo' : 'Paket token')}</strong><p>{item.email}</p><small>{item.id}</small></td>
          <td className="billing-order-amount">{rupiah(item.amount)}<p>{item.funding === 'wallet' ? 'Saldo pelanggan' : 'QRIS'}</p></td>
          <td><Status status={item.state}/><p>{item.kind === 'topup' ? (item.fulfilled ? 'Saldo sudah dikreditkan' : 'Saldo belum dikreditkan') : item.fulfilled ? 'Key sudah diterbitkan' : 'Key belum diterbitkan'}</p></td>
          <td><p>Dibuat: {dateLabel(item.created_at)}</p>{item.paid_at && <p>Lunas: {dateLabel(item.paid_at)}</p>}</td>
          <td><div className="dash-table-actions">{item.funding !== 'wallet' ? <><button type="button" className="dash-button" disabled={busy} aria-label={`Periksa status pesanan ${item.id}`} title="Periksa status pembayaran" onClick={() => mutate(`/orders/${encodeURIComponent(item.id)}/sync`, {}, 'Status pesanan selesai diperiksa.')}><BillingIcon/>Periksa status</button>{['pending', 'unknown'].includes(item.state) && <button type="button" className="dash-button dash-button-danger" disabled={busy} aria-label={`Batalkan pesanan ${item.id}`} title="Batalkan pesanan" onClick={() => confirm('order', item)}><BillingIcon cancel/>Batalkan</button>}</> : <span className="dash-muted">Dibayar dari saldo</span>}</div></td>
        </tr>)}</tbody></table></div> : <div className="billing-empty"><h3>Tidak ada pesanan</h3><p className="dash-muted">{status ? 'Tidak ada pesanan untuk status ini. Pilih status lain atau tampilkan semua.' : 'Pesanan checkout akan ditampilkan di sini.'}</p>{status && <button type="button" className="dash-button" disabled={busy} onClick={() => filterOrders('')}>Tampilkan semua status</button>}</div>}<div className="dash-pagination"><button type="button" className="dash-button" disabled={busy || page <= 1} onClick={() => { setPage((value) => value - 1); setConfirmation(null); }}>Sebelumnya</button><span>Halaman {orders.data.page} / {Math.max(1, orders.data.total_pages)} · {count(orders.data.total)} pesanan</span><button type="button" className="dash-button" disabled={busy || page >= orders.data.total_pages} onClick={() => { setPage((value) => value + 1); setConfirmation(null); }}>Berikutnya</button></div></>}
      </section>
      </div>
    </> : <section id={`sales-panel-${tab}`} role="tabpanel" aria-labelledby={`sales-tab-${tab}`} tabIndex="0" aria-busy={busy} className="dash-card">
      {tab === 'settings' && <MessageSettings />}
      {tab === 'accounts' && <><h2>Akun provider</h2><RequestExplanation/><ResourceState resource={keys} retry={refresh}/>{keys.data && (keys.data.connections.length ? <div className="dash-table-wrap" tabIndex={0} role="region" aria-label="Daftar data, gulir ke kanan untuk kolom lainnya"><table className="dash-table"><caption className="dash-sr-only">Batas request harian akun provider tanpa kredensial rahasia</caption><thead><tr><th scope="col">Akun / provider</th><th scope="col">Pemakaian / batas request</th><th scope="col">Status</th><th scope="col">Tindakan</th></tr></thead><tbody>{keys.data.connections.map((item) => <tr key={item.id}><td><strong>{item.name || 'Tanpa nama'}</strong><p>{item.provider}</p><small>ID: {item.id}</small></td><td><RequestUsage usage={item.requestUsage} periods={[["daily", "Request harian"]]}/></td><td>{item.isActive ? 'Aktif' : 'Nonaktif'}</td><td><button type="button" className="dash-button" disabled={busy} aria-label={`Edit batas akun ${item.name || item.id}`} onClick={() => edit(item)}>Edit batas</button></td></tr>)}</tbody></table></div> : <p className="dash-muted">Belum ada akun provider yang tercatat.</p>)}</>}
      {(tab === 'packages' || tab === 'keys') && <>
      {tab === 'packages' ? <><div className="dash-row"><h2>Paket token</h2><button type="button" className="dash-button dash-button-primary" disabled={busy} onClick={() => edit({ ...newPackage })}>Tambah paket</button></div><ResourceState resource={packages} retry={refresh}/>{packages.data && (packages.data.packages.length ? <div className="dash-table-wrap" tabIndex={0} role="region" aria-label="Daftar data, gulir ke kanan untuk kolom lainnya"><table className="dash-table"><caption className="dash-sr-only">Paket token router</caption><thead><tr><th scope="col">Paket</th><th scope="col">Harga IDR</th><th scope="col">Kuota / batas</th><th scope="col">Model / fitur</th><th scope="col">Status</th><th scope="col">Tindakan</th></tr></thead><tbody>{packages.data.packages.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><p>{item.description}</p><small>ID: {item.id}</small></td><td>{rupiah(item.price)}</td><td>{count(item.tokenAmount)} token<p>RPM {count(item.rpmLimit)} · TPM {count(item.tpmLimit)}</p><p>{count(item.validityDays)} hari</p></td><td>Diizinkan: {modelsLabel(item.allowedModels)}<p>Diblokir: {modelsLabel(item.blockedModels, true)}</p>{item.features.length > 0 && <ul>{item.features.map((feature, index) => <li key={index}>{feature}</li>)}</ul>}</td><td>{item.isActive ? 'Aktif' : 'Nonaktif'}{item.isPopular && <p>Populer</p>}{item.badge && <p>{item.badge}</p>}<p>Urutan: {item.sortOrder}</p></td><td><div className="dash-table-actions"><button type="button" className="dash-button" disabled={busy} aria-label={`Edit paket ${item.name}`} onClick={() => edit(item)}>Edit</button><button type="button" className="dash-button dash-button-danger" disabled={busy} aria-label={`Hapus paket ${item.name}`} onClick={() => confirm('package', item)}>Hapus</button></div></td></tr>)}</tbody></table></div> : <p className="dash-muted">Belum ada paket. Tambahkan paket nyata untuk ditampilkan kepada pembeli.</p>)}</> : <><h2>Key pelanggan</h2><p className="dash-muted">Semua key, termasuk key manual, ditampilkan tanpa nilai rahasia. Untuk penerbitan manual, gunakan <a className="dash-text-link" href="/dashboard/endpoint">Endpoint & Key</a>.</p><ResourceState resource={keys} retry={refresh}/>{keys.data && (keys.data.keys.length ? <div className="dash-table-wrap" tabIndex={0} role="region" aria-label="Daftar data, gulir ke kanan untuk kolom lainnya"><table className="dash-table"><caption className="dash-sr-only">Key pelanggan tanpa nilai rahasia</caption><thead><tr><th scope="col">Pelanggan / key</th><th scope="col">Pemakaian / kuota</th><th scope="col">Batas / model</th><th scope="col">Status / kedaluwarsa</th><th scope="col">Tindakan</th></tr></thead><tbody>{keys.data.keys.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><p>{item.customerEmail || 'Email tidak tersedia'}</p><small>ID: {item.id}</small><p>Paket: {item.packageId || 'Tidak terkait paket'}</p></td><td>{count(item.tokensUsed)} / {item.tokenLimit === 0 ? 'Tanpa batas' : count(item.tokenLimit)}</td><td>RPM {count(item.rpmLimit)} · TPM {count(item.tpmLimit)}<div>Diizinkan: {modelsLabel(item.allowedModels)}<p>Diblokir: {modelsLabel(item.blockedModels, true)}</p></div></td><td>{!item.isActive ? 'Dicabut / nonaktif' : item.expired ? 'Kedaluwarsa' : item.exhausted ? 'Kuota habis' : 'Siap dipakai'}<p>{item.expiresAt ? dateLabel(item.expiresAt) : 'Tanpa batas waktu'}</p></td><td><div className="dash-table-actions"><button type="button" className="dash-button" disabled={busy} aria-label={`Edit batas key ${item.name}`} onClick={() => edit(item)}>Edit batas</button><button type="button" className="dash-button dash-button-danger" disabled={busy || !item.isActive} aria-label={`Nonaktifkan key ${item.name}`} onClick={() => confirm('key', item)}>Nonaktifkan</button></div></td></tr>)}</tbody></table></div> : <p className="dash-muted">Belum ada key pelanggan yang tercatat.</p>)}</>}
      </>}
    </section>}
  </div>;
}
