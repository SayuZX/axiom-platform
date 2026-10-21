'use client';

import { useEffect, useState } from 'react';
import DashboardShell from '../../components/DashboardShell';
import { updateCategories } from '../../components/Updates';
import styles from '../../components/updates.module.css';

const empty = () => ({ title: '', slug: '', category: 'UPDATE', summary: '', content: '', version: '', status: 'draft', published_at: '', expires_at: '', audience: 'public', is_pinned: false, publish_to_api: false, service_stage: null });
function localDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function editRecord(item) { return { ...empty(), ...item, version: item.version || '', published_at: localDate(item.published_at), expires_at: localDate(item.expires_at), publish_to_api: item.publish_to_api === true }; }
async function request(body, signal) {
  const response = await fetch('/manage-api/announcements', { cache: 'no-store', signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || (body ? !data.item?.id : !Array.isArray(data.items))) throw new Error(typeof data?.error === 'string' ? data.error : 'Pengumuman tidak dapat diakses. Periksa koneksi dan sesi admin, lalu coba lagi.');
  return data;
}
export default function AnnouncementsPage() {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    request(undefined, controller.signal).then(data => { if (!controller.signal.aborted) setItems(data.items); }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(key, value) { setDraft(current => ({ ...current, [key]: value })); setDirty(true); setNotice(''); }
  function select(item) {
    if (dirty && !window.confirm('Buang perubahan yang belum disimpan?')) return;
    setDraft(item ? editRecord(item) : empty()); setDirty(false); setError(''); setNotice('');
  }
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setError(''); setNotice('');
    const status = event.nativeEvent.submitter?.value === 'published' ? 'published' : 'draft';
    const body = { ...draft, status };
    for (const key of ['title', 'slug', 'summary', 'content', 'version']) body[key] = body[key].trim();
    if (['title', 'slug', 'summary', 'content'].some(key => !body[key])) { setError('Judul, slug, ringkasan, dan isi wajib diisi, bukan hanya spasi.'); return; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) { setError('Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung di antara kata.'); return; }
    if (!updateCategories.includes(body.category) || !['public', 'customers'].includes(body.audience)) { setError('Pilih kategori dan audiens yang valid.'); return; }
    if (body.service_stage !== null && (!['investigating', 'fixing', 'monitoring', 'resolved'].includes(body.service_stage) || body.category === 'PRICING')) { setError('Pilih tahap layanan yang valid. Kategori PRICING tidak dapat melacak tahap layanan.'); return; }
    if (body.publish_to_api && (body.audience !== 'public' || !/^[\x20-\x7e]+$/.test(body.title) || !/^[\x20-\x7e]+$/.test(body.summary))) { setError('Notifikasi API memerlukan audiens publik serta judul dan ringkasan ASCII satu baris (tanpa emoji atau karakter khusus).'); return; }
    const published = body.published_at ? new Date(body.published_at) : status === 'published' ? new Date() : null;
    const expires = body.expires_at ? new Date(body.expires_at) : null;
    if ((published && !Number.isFinite(published.getTime())) || (expires && !Number.isFinite(expires.getTime()))) { setError('Tanggal publikasi atau kedaluwarsa tidak valid.'); return; }
    if (expires && (!published || expires <= published)) { setError('Isi tanggal publikasi sebelum menentukan kedaluwarsa. Kedaluwarsa harus setelah waktu publikasi.'); return; }
    body.published_at = published?.toISOString() || null;
    body.expires_at = expires?.toISOString() || null;
    setSaving(true);
    try {
      const { item } = await request(body);
      setItems(current => [item, ...current.filter(existing => existing.id !== item.id)]);
      setDraft(editRecord(item)); setDirty(false);
      setNotice(item.status === 'published' ? 'Pengumuman diterbitkan sesuai tanggal dan audiens yang dipilih.' : 'Draf tersimpan. Pengumuman tidak ditampilkan kepada pembaca.');
    } catch (error) { setError(error.message); } finally { setSaving(false); }
  }
  return <DashboardShell role="admin" title="Pengumuman" description="Kelola catatan produk, informasi pelanggan, dan notifikasi API.">
    <div className="dash-actions"><button type="button" className="dash-button" disabled={saving} onClick={() => select(null)}>Buat pengumuman</button><button type="button" className="dash-button" disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Muat ulang daftar</button><a className="dash-button" href="/changelog" target="_blank" rel="noopener noreferrer">Lihat halaman publik</a></div>
    {error && <div className="dash-card" role="alert"><p>{error}</p><button type="button" className="dash-button" disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Coba muat daftar lagi</button></div>}
    {notice && <p role="status">{notice}</p>}
    <div className={styles.editor}><section aria-label="Daftar pengumuman" className="dash-card"><h2>Semua pengumuman</h2>{loading && <p role="status">Memuat pengumuman…</p>}{!loading && !items.length && !error && <p>Belum ada pengumuman. Isi formulir untuk membuat draf pertama.</p>}<div className={styles.editorList}>{items.map(item => <button type="button" className="dash-button" key={item.id} disabled={saving} aria-pressed={draft.id === item.id} onClick={() => select(item)}><strong>{item.title}</strong><small>{item.status === 'published' ? 'Diterbitkan' : 'Draf'} · {item.audience === 'public' ? 'Publik' : 'Pelanggan'}{item.is_pinned ? ' · Disematkan' : ''}</small></button>)}</div></section>
      <section className="dash-card"><h2>{draft.id ? 'Edit pengumuman' : 'Pengumuman baru'}</h2><p className={styles.editorHelp}>Status tersimpan: {draft.id ? draft.status === 'published' ? 'Diterbitkan' : 'Draf' : 'Belum disimpan'}. {dirty && 'Ada perubahan yang belum disimpan.'}</p><form className="dash-form" onSubmit={save}><fieldset disabled={saving}>
        <label className="dash-field">Judul<input required maxLength={120} value={draft.title} onChange={event => change('title', event.target.value)} /></label>
        <label className="dash-field">Slug<input required maxLength={160} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} onChange={event => change('slug', event.target.value)} aria-describedby="slug-help" /></label><p id="slug-help" className={styles.editorHelp}>Identitas tautan unik, misalnya pembaruan-model-oktober. Mengubah slug juga mengubah tautan pengumuman.</p>
        <div className="dash-grid"><label className="dash-field">Kategori<select value={draft.category} onChange={event => change('category', event.target.value)}>{updateCategories.map(category => <option key={category}>{category}</option>)}</select></label><label className="dash-field">Versi (opsional)<input maxLength={40} value={draft.version} onChange={event => change('version', event.target.value)} placeholder="Contoh: 2.4.0" /></label></div>
        <label className="dash-field">Ringkasan<textarea required rows={3} maxLength={1600} value={draft.summary} onChange={event => change('summary', event.target.value)} /></label>
        <label className="dash-field">Isi pengumuman<textarea required rows={14} maxLength={20000} value={draft.content} onChange={event => change('content', event.target.value)} aria-describedby="content-help" /></label><p id="content-help" className={styles.editorHelp}>Markdown: ## Judul, **tebal**, *miring*, ~~coret~~, - daftar, 1. urutan, - [x] checklist, &gt; kutipan, `kode`, blok kode tiga backtick, [tautan](https://…), tabel, dan simbol ✓ → •. HTML mentah tidak ditampilkan.</p>
        <label className="dash-field">Audiens<select value={draft.audience} onChange={event => change('audience', event.target.value)}><option value="public">Publik dan pelanggan</option><option value="customers">Pelanggan yang login saja</option></select></label>
        <label className="dash-field">Tahap layanan<select value={draft.service_stage ?? ''} onChange={event => change('service_stage', event.target.value || null)} aria-describedby="service-stage-help"><option value="">Tanpa pelacakan</option><option value="investigating">Investigasi</option><option value="fixing">Penanganan</option><option value="monitoring">Pemantauan</option><option value="resolved">Selesai</option></select></label><p id="service-stage-help" className={styles.editorHelp}>Tahap diperbarui manual oleh admin, bukan estimasi otomatis. Pengumuman bertahap yang diterbitkan tampil di Status Sistem sesuai jadwal dan audiens tanpa mengaktifkan notifikasi API. Kategori PRICING tidak mendukung pelacakan.</p>
        <div className="dash-grid"><label className="dash-field">Tanggal publikasi (opsional)<input type="datetime-local" value={draft.published_at} onChange={event => change('published_at', event.target.value)} /></label><label className="dash-field">Kedaluwarsa (opsional)<input type="datetime-local" value={draft.expires_at} onChange={event => change('expires_at', event.target.value)} /></label></div><p className={styles.editorHelp}>Waktu mengikuti zona waktu perangkat. Publikasi kosong memakai waktu saat diterbitkan. Tanggal mendatang menjadwalkan tampilan. Kedaluwarsa kosong berarti tanpa batas.</p>
        <label className={styles.check}><input type="checkbox" checked={draft.is_pinned} onChange={event => change('is_pinned', event.target.checked)} />Sematkan pengumuman</label>
        <label className={styles.check}><input type="checkbox" checked={draft.publish_to_api} onChange={event => change('publish_to_api', event.target.checked)} />Terbitkan juga sebagai notifikasi API</label><p className={styles.editorHelp}>Notifikasi API hanya untuk audiens publik. Judul dan ringkasan harus ASCII satu baris agar sesuai protokol API. Draf tidak ditampilkan.</p>
        <div className="dash-actions"><button type="submit" name="status" value="draft" className="dash-button" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan sebagai draf'}</button><button type="submit" name="status" value="published" className="dash-button primary" disabled={saving}>{saving ? 'Menyimpan…' : draft.status === 'published' ? 'Simpan dan terbitkan perubahan' : 'Terbitkan pengumuman'}</button></div><p className={styles.editorHelp}>Menyimpan sebagai draf menarik pengumuman yang sudah diterbitkan dari daftar pembaca.</p>
      </fieldset></form></section></div>
  </DashboardShell>;
}
