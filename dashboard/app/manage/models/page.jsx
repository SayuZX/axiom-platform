'use client';
import GlobalFeedback from '../../components/GlobalFeedback';

import { useEffect, useState } from 'react';
import { AdminLink as Link } from '../../components/AdminEmbed';
import DashboardShell from '../../components/DashboardShell';
import AdminDialog, { ErrorDialog } from '../AdminDialog';

const empty = { provider: '', modelId: '', displayName: '', description: '', category: 'Chat', badge: '', contextWindow: '', maxOutput: '', capabilities: { vision: false, reasoning: false, search: false, tools: false }, isActive: true, isPopular: false, sortOrder: 0 };
const labels = { vision: 'Vision', reasoning: 'Reasoning', search: 'Pencarian', tools: 'Tools' };
async function api(path, body) {
  const response = await fetch('/manage-api/' + path, { cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Layanan model tidak tersedia.');
  return data;
}
export default function ModelsPage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(null);
  async function load() {
    setLoading(true);
    try { setData(await api('models')); } finally { setLoading(false); }
  }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  function edit(row) {
    setEditing(row?.id ?? null);
    setDraft(row ? { ...row, contextWindow: row.contextWindow ?? '', maxOutput: row.maxOutput ?? '', capabilities: { ...empty.capabilities, ...row.capabilities } } : { ...empty, sortOrder: data?.models.length ? Math.max(...data.models.map(model => model.sortOrder)) + 1 : 1 });
    setError(''); setNotice('');
  }
  function choose(id) {
    const live = data.liveModels.find(model => model.id === id);
    if (!live) return;
    const slash = live.id.indexOf('/');
    setDraft(previous => ({ ...previous, provider: slash < 0 ? live.provider : live.id.slice(0, slash), modelId: slash < 0 ? live.id : live.id.slice(slash + 1), displayName: live.name, contextWindow: live.contextWindow ?? '', maxOutput: live.maxOutput ?? '', capabilities: Object.fromEntries(Object.keys(labels).map(key => [key, live[key] === true])) }));
  }
  async function mutate(path, body, message, close = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path, body);
      if (close) { setDraft(null); setEditing(null); }
      setNotice(message);
      await load();
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(Object.keys(empty).map(key => [key, draft[key]]));
    body.capabilities = Object.fromEntries(Object.keys(labels).map(key => [key, draft.capabilities[key] === true]));
    body.contextWindow = draft.contextWindow === '' ? null : Number(draft.contextWindow);
    body.maxOutput = draft.maxOutput === '' ? null : Number(draft.maxOutput);
    body.sortOrder = Number(draft.sortOrder);
    mutate('models' + (editing ? '/' + encodeURIComponent(editing) : ''), body, 'Showcase disimpan. Katalog publik memakai perubahan ini.', true);
  }
  const rows = (data?.models ?? []).filter(row => `${row.modelId} ${row.provider} ${row.displayName} ${row.category}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'published' ? row.published : filter === 'unmatched' ? !row.matched : !row.isActive)));
  const currentLiveId = draft && (data?.liveModels.find(model => model.id === draft.modelId || model.id === `${draft.provider}/${draft.modelId}`)?.id ?? '');
  return <DashboardShell role="admin" title="Model Showcase" description="Kurasi tampilan model terhubung tanpa membuat model atau tarif fiktif.">
    <div className="dash-actions"><button className="dash-button" onClick={() => edit(null)} disabled={busy || loading || !data?.available}>Tambah showcase</button><button className="dash-button" onClick={() => { setError(''); load().catch(error => setError(error.message)); }} disabled={busy || loading}>Muat ulang</button><Link className="dash-button" href="/manage/pricing">Atur harga model</Link></div>
    <ErrorDialog message={error} onClose={() => setError('')}/>
    {deleting && <AdminDialog title="Hapus showcase?" pending={busy} onClose={() => setDeleting(null)} confirmLabel="Hapus showcase" onConfirm={async () => { await mutate('models/' + encodeURIComponent(deleting.id) + '/delete', {}, 'Showcase dihapus. Model router dan tarif tetap tersimpan.', editing === deleting.id); setDeleting(null); }}><p>{deleting.displayName}</p><p>Model router dan harga tidak dihapus.</p></AdminDialog>}
    {notice && <GlobalFeedback info>{notice}</GlobalFeedback>}
    <ErrorDialog message={data && !data.available ? 'Katalog router belum tersedia. Rekaman tersimpan tetap ditampilkan, tetapi pencocokan, penambahan, dan publikasi model baru tidak tersedia. Coba muat ulang.' : ''}/>
    {draft && <section className="dash-card" aria-labelledby="showcase-editor"><h2 id="showcase-editor">{editing ? 'Edit showcase' : 'Tambah showcase'}</h2><form className="dash-form" onSubmit={submit}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className="dash-field">Model terhubung<select value={currentLiveId} onChange={event => choose(event.target.value)} required={!editing}><option value="">{editing && !currentLiveId ? `Rekaman lama: ${draft.provider}/${draft.modelId} (tidak cocok)` : 'Pilih ID model persis'}</option>{data?.liveModels.map(model => <option key={model.id} value={model.id}>{model.id}</option>)}</select></label>
        <p className="dash-muted">ID tersimpan: <code>{draft.modelId || 'Belum dipilih'}</code>. Rekaman tanpa kecocokan persis tidak ditampilkan pada katalog publik. Tarif dikelola terpisah di Model Pricing.</p>
        <div className="dash-grid"><label className="dash-field">Nama tampilan<input value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} maxLength={160} required /></label><label className="dash-field">Kategori<input value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} maxLength={80} required /></label><label className="dash-field">Label / badge<input value={draft.badge} onChange={event => setDraft({ ...draft, badge: event.target.value })} maxLength={80} /></label></div>
        <label className="dash-field">Deskripsi<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} maxLength={3000} rows={3} /></label>
        <div className="dash-grid"><label className="dash-field">Jendela konteks (token)<input type="number" min="1" max="2147483647" step="1" placeholder="Gunakan data router" value={draft.contextWindow} onChange={event => setDraft({ ...draft, contextWindow: event.target.value })} /></label><label className="dash-field">Output maksimum (token)<input type="number" min="1" max="2147483647" step="1" placeholder="Gunakan data router" value={draft.maxOutput} onChange={event => setDraft({ ...draft, maxOutput: event.target.value })} /></label><label className="dash-field">Urutan tampil<input type="number" min="0" max="1000000" step="1" required value={draft.sortOrder} onChange={event => setDraft({ ...draft, sortOrder: event.target.value })} /></label></div>
        <div className="dash-actions">{Object.entries(labels).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.capabilities[key] === true} onChange={event => setDraft({ ...draft, capabilities: { ...draft.capabilities, [key]: event.target.checked } })} /> {label}</label>)}</div>
        <div className="dash-actions"><label><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} /> Showcase aktif</label><label><input type="checkbox" checked={draft.isPopular} onChange={event => setDraft({ ...draft, isPopular: event.target.checked })} /> Model populer</label></div>
        <div className="dash-actions"><button className="dash-button" type="submit">{busy ? 'Menyimpan…' : 'Simpan showcase'}</button><button className="dash-button" type="button" onClick={() => setDraft(null)}>Batal</button></div>
      </fieldset>
    </form></section>}
    <section className="dash-card" aria-labelledby="showcase-list"><div className="dash-actions"><h2 id="showcase-list">Daftar showcase</h2><span className="dash-muted">{data ? `${data.models.length} rekaman · ${data.models.filter(model => model.published).length} dipublikasikan` : 'Memuat data…'}</span></div>
      <div className="dash-grid"><label className="dash-field">Cari model<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nama, ID, provider, kategori" /></label><label className="dash-field">Status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Semua rekaman</option><option value="published">Dipublikasikan</option><option value="inactive">Nonaktif</option><option value="unmatched">Tidak cocok dengan router</option></select></label></div>
      {loading && <p role="status" className="dash-muted">Memuat showcase…</p>}
      {!loading && data && !rows.length && <p className="dash-muted">{data.models.length ? 'Tidak ada rekaman sesuai pencarian.' : 'Belum ada showcase. Tambahkan model dari katalog router yang terhubung.'}</p>}
      {rows.length > 0 && <div className="dash-table-wrap"><table className="dash-table"><thead><tr><th scope="col">Urutan</th><th scope="col">Model</th><th scope="col">Publikasi</th><th scope="col">Populer</th><th scope="col">Tindakan</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.sortOrder}</td><td><strong>{row.displayName}</strong><div className="dash-muted"><code>{row.liveId || `${row.provider}/${row.modelId}`}</code></div><div className="dash-muted">{row.category}{row.badge ? ` · ${row.badge}` : ''}</div></td><td>{!data.available ? 'Belum dapat diverifikasi' : !row.matched ? 'Tidak cocok · tidak dipublikasikan' : row.isActive ? 'Dipublikasikan' : 'Nonaktif'}</td><td>{row.isPopular ? 'Ya' : 'Tidak'}</td><td><div className="dash-actions"><button className="dash-button" disabled={busy} onClick={() => edit(row)}>Edit</button><button className="dash-button" disabled={busy || (!row.isActive && !row.matched)} onClick={() => mutate('models/' + encodeURIComponent(row.id), { isActive: !row.isActive }, row.isActive ? 'Showcase dinonaktifkan.' : 'Showcase diaktifkan.')}>{row.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button><button className="dash-button" disabled={busy} onClick={() => mutate('models/' + encodeURIComponent(row.id), { isPopular: !row.isPopular }, 'Status populer diperbarui.')}>{row.isPopular ? 'Hapus populer' : 'Jadikan populer'}</button><button className="dash-button" disabled={busy} onClick={() => setDeleting(row)}>Hapus</button></div></td></tr>)}</tbody></table></div>}
      <p className="dash-muted">Edit nilai urutan untuk mengatur posisi model. Menonaktifkan showcase hanya menghapus kurasi publik, bukan akses model router. Rekaman lama dan tarif native tidak diubah otomatis.</p>
    </section>
  </DashboardShell>;
}
