'use client';
import GlobalFeedback from '../../components/GlobalFeedback';

import { useEffect, useRef, useState } from 'react';
import DashboardShell from '../../components/DashboardShell';
import AdminDialog, { ErrorDialog } from '../AdminDialog';

function localDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
async function api(body) {
  const response = await fetch(body === undefined ? '/site-api/maintenance' : '/manage-api/maintenance', {
    cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || 'Pengaturan tidak dapat diakses. Periksa koneksi dan sesi admin, lalu coba lagi.');
  return data;
}
export default function MaintenanceSettingsPage() {
  const formRef = useRef(null);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function receive(data) {
    setSaved(data);
    setDraft({ enabled: data.enabled, title: data.title, message: data.message, estimatedEnd: localDate(data.estimatedEnd), retryAfter: data.retryAfter });
    setConfirming(false);
  }
  async function load() {
    setLoading(true); setError(''); setNotice('');
    try { receive(await api()); } catch (error) { setError(error.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  function change(key, value) { setDraft(current => ({ ...current, [key]: value })); setNotice(''); }
  const enabling = draft?.enabled && !saved?.enabled;
  async function save(event, approved = false) {
    event?.preventDefault();
    if (saving) return;
    setError(''); setNotice('');
    const form = formRef.current;
    for (const name of ['title', 'message']) {
      const input = form.elements.namedItem(name);
      input.setCustomValidity(input.value.trim() ? '' : 'Wajib diisi.');
    }
    if (!form.reportValidity()) return;
    if (enabling && !approved) { setConfirming(true); return; }
    const retryAfter = Number(draft.retryAfter);
    const estimatedEnd = draft.estimatedEnd ? new Date(draft.estimatedEnd) : null;
    setSaving(true);
    try {
      const data = await api({ enabled: draft.enabled, title: draft.title.trim(), message: draft.message.trim(), estimatedEnd: estimatedEnd?.toISOString() || null, retryAfter });
      receive(data); setNotice(data.enabled ? 'Tersimpan. Maintenance aktif untuk website dan API model.' : 'Tersimpan. Maintenance nonaktif; website dan API model tidak diblokir oleh maintenance.');
    } catch (error) { setConfirming(false); setError(error.message); } finally { setSaving(false); }
  }
  return <DashboardShell role="admin" title="Maintenance" description="Atur pemberitahuan dan hentikan sementara website serta API model dari satu pengaturan.">
    <div className="dash-actions"><button className="dash-button" disabled={loading || saving} onClick={load}>Muat ulang pengaturan</button><a className="dash-button" href="/maintenance" target="_blank" rel="noopener noreferrer">Pratinjau tersimpan (tab baru)</a></div>
    <ErrorDialog message={error} onClose={() => setError('')}/>
    {confirming && <AdminDialog title="Aktifkan maintenance?" pending={saving} onClose={() => setConfirming(false)} confirmLabel="Aktifkan maintenance" onConfirm={() => save(null, true)}><p>Website dan permintaan API model tidak tersedia bagi pelanggan sampai maintenance dinonaktifkan. Login, admin, dan webhook pembayaran tetap dapat diakses.</p></AdminDialog>}
    {notice && <GlobalFeedback info>{notice}</GlobalFeedback>}
    {loading && <p className="dash-muted" role="status">Memuat pengaturan maintenance…</p>}
    {draft && <section className="dash-card" aria-labelledby="maintenance-settings"><h2 id="maintenance-settings">Pengaturan layanan</h2>
      <p className="dash-muted">Status tersimpan: <strong>{saved.enabled ? 'Aktif' : 'Nonaktif'}</strong>. Login, admin, dan webhook pembayaran tetap dapat diakses. Pratinjau menggunakan pengaturan tersimpan, bukan perubahan yang belum disimpan.</p>
      <form ref={formRef} className="dash-form" onSubmit={save} onInput={event => event.target.setCustomValidity?.('')}><fieldset disabled={loading || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}><input type="checkbox" checked={draft.enabled} onChange={event => change('enabled', event.target.checked)} />Aktifkan maintenance website dan API model</label>
        <label className="dash-field">Judul pemberitahuan<input name="title" required maxLength={120} value={draft.title} onChange={event => change('title', event.target.value)} /></label>
        <label className="dash-field">Pesan untuk pengunjung<textarea name="message" required rows={5} maxLength={2000} value={draft.message} onChange={event => change('message', event.target.value)} /></label>
        <div className="dash-grid"><label className="dash-field">Perkiraan selesai (opsional)<input type="datetime-local" value={draft.estimatedEnd} aria-describedby="maintenance-time-help" onChange={event => change('estimatedEnd', event.target.value)} /></label><label className="dash-field">Retry-After (detik)<input type="number" required min="30" max="86400" step="1" inputMode="numeric" value={draft.retryAfter} aria-describedby="maintenance-retry-help" onChange={event => change('retryAfter', event.target.value)} /></label></div>
        <p className="dash-muted" id="maintenance-time-help">Waktu mengikuti zona waktu perangkat Anda. Halaman publik menampilkan WIB. Kosongkan jika belum diketahui; tidak ada perkiraan otomatis.</p>
        <p className="dash-muted" id="maintenance-retry-help">Petunjuk jeda untuk klien HTTP, 30–86400 detik. Nilai ini bukan waktu selesai dan tidak menonaktifkan maintenance secara otomatis.</p>
        <div className="dash-actions"><button className="dash-button primary" type="submit" disabled={saving || loading}>{saving ? 'Menyimpan…' : enabling ? 'Simpan dan aktifkan maintenance' : 'Simpan pengaturan'}</button></div>
      </fieldset></form>
      {saved.updatedAt && <p className="dash-muted">Terakhir diperbarui {new Date(saved.updatedAt).toLocaleString('id-ID')}.</p>}
    </section>}
  </DashboardShell>;
}
