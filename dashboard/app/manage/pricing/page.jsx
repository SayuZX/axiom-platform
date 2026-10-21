'use client';
import GlobalFeedback from '../../components/GlobalFeedback';

import { useEffect, useState } from 'react';
import { ErrorDialog } from '../AdminDialog';
import { AdminLink as Link } from '../../components/AdminEmbed';
import DashboardShell from '../../components/DashboardShell';

const fields = [
  ['input', 'inputPrice', 'Input'], ['output', 'outputPrice', 'Output'], ['cached', 'cachedPrice', 'Input cache'],
  ['reasoning', 'reasoningPrice', 'Reasoning'], ['cache_creation', 'cacheCreationPrice', 'Pembuatan cache'],
];
const money = value => typeof value === 'number' ? '$' + value.toLocaleString('en-US', { maximumFractionDigits: 10 }) : 'Belum ditetapkan';
async function api(body) {
  const response = await fetch('/manage-api/pricing', { cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Katalog harga tidak tersedia. Periksa koneksi router lalu muat ulang.');
  return data;
}
export default function PricingPage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  async function load() {
    setLoading(true);
    try { setData(await api()); } catch (error) { setData(null); throw error; } finally { setLoading(false); }
  }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  function edit(model) {
    setDraft({ id: model.id, name: model.name, ...Object.fromEntries(fields.map(([key, property]) => [key, model[property] ?? ''])) });
    setError(''); setNotice('');
  }
  async function save(event) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const body = { id: draft.id, ...Object.fromEntries(fields.map(([key]) => [key, draft[key] === '' ? null : Number(draft[key])])) };
      await api(body);
      setDraft(null); setNotice('Harga disimpan di konfigurasi native. Katalog publik dan kalkulator memakai perubahan ini.');
      await load();
    } catch (error) { setError(error.message); } finally { setSaving(false); }
  }
  const models = data?.models ?? [];
  const providers = [...new Set(models.map(model => model.provider))].sort();
  const rows = models.filter(model => `${model.id} ${model.name} ${model.provider}`.toLowerCase().includes(query.toLowerCase()) && (!provider || model.provider === provider) && (!onlyMissing || model.inputPrice === null || model.outputPrice === null));
  const priced = models.filter(model => model.inputPrice !== null && model.outputPrice !== null).length;
  return <DashboardShell role="admin" title="Model Pricing" description="Tetapkan tarif USD per satu juta token untuk ID model yang benar-benar terhubung.">
    <div className="dash-actions"><button className="dash-button" disabled={loading || saving} onClick={() => { setError(''); load().catch(error => setError(error.message)); }}>Muat ulang</button><Link className="dash-button" href="/manage/models">Kelola showcase</Link><Link className="dash-button" href="/pricing">Lihat harga publik</Link></div>
    <ErrorDialog message={error} onClose={() => setError('')}/>
    <GlobalFeedback info>{notice}</GlobalFeedback>
    <div className="dash-grid"><section className="dash-card dash-stat"><span className="dash-muted">Model terhubung</span><strong>{data ? models.length : '—'}</strong></section><section className="dash-card dash-stat"><span className="dash-muted">Tarif input & output ditetapkan</span><strong>{data ? priced : '—'}</strong></section><section className="dash-card dash-stat"><span className="dash-muted">Belum lengkap</span><strong>{data ? models.length - priced : '—'}</strong></section></div>
    <section className="dash-card"><h2>Satu sumber harga</h2><p className="dash-muted">Harga disimpan pada konfigurasi pricing native router, bukan pada rekaman showcase. Nilai kosong berarti belum ditetapkan; angka 0 hanya untuk tarif gratis yang sengaja ditetapkan. Tarif bawaan dan contoh model tidak otomatis diterbitkan.</p><p className="dash-muted">Tarif ini untuk informasi USD dan kalkulator. Saldo serta pembelian paket pelanggan tetap mengikuti harga paket IDR; tidak ada konversi otomatis.</p></section>
    {draft && <section className="dash-card" aria-labelledby="pricing-editor"><h2 id="pricing-editor">Edit harga · {draft.name}</h2><p><code>{draft.id}</code></p><form className="dash-form" onSubmit={save}><fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="dash-grid">{fields.map(([key, , label]) => <label className="dash-field" key={key}>{label} (USD / 1 juta token)<input type="number" min="0" max="1000000" step="any" inputMode="decimal" placeholder="Belum ditetapkan" value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}</div><p className="dash-muted">Kosongkan kolom untuk menghapus tarif kustom bidang tersebut dari publikasi. Konfigurasi lain serta model lain tetap dipertahankan. Router dapat memakai tarif bawaan internalnya ketika override dihapus.</p><div className="dash-actions"><button className="dash-button" type="submit">{saving ? 'Menyimpan…' : 'Simpan harga'}</button><button className="dash-button" type="button" onClick={() => setDraft(null)}>Batal</button></div></fieldset></form></section>}
    <section className="dash-card" aria-labelledby="pricing-list"><h2 id="pricing-list">Harga model terhubung</h2><div className="dash-grid"><label className="dash-field">Cari model<input type="search" value={query} placeholder="Nama atau ID model" onChange={event => setQuery(event.target.value)} /></label><label className="dash-field">Provider<select value={provider} onChange={event => setProvider(event.target.value)}><option value="">Semua provider</option>{providers.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div><label><input type="checkbox" checked={onlyMissing} onChange={event => setOnlyMissing(event.target.checked)} /> Hanya tarif input / output yang belum lengkap</label>
      {loading && <p className="dash-muted" role="status">Memuat model terhubung dan harga native…</p>}
      {!loading && data && !rows.length && <p className="dash-muted">Tidak ada model sesuai filter.</p>}
      {rows.length > 0 && <div className="dash-table-wrap"><table className="dash-table"><caption className="dash-muted" style={{ textAlign: 'left', padding: '12px 0' }}>USD per satu juta token · {rows.length} model</caption><thead><tr><th scope="col">Model</th>{fields.map(([key, , label]) => <th key={key} scope="col">{label}</th>)}<th scope="col">Tindakan</th></tr></thead><tbody>{rows.map(model => <tr key={model.id}><td><strong>{model.name}</strong><div><code>{model.id}</code></div><span className="dash-muted">{model.showcased ? 'Showcase aktif' : 'Tanpa showcase'}</span></td>{fields.map(([key, property]) => <td key={key}>{money(model[property])}</td>)}<td><button className="dash-button" disabled={saving} onClick={() => edit(model)}>Edit harga</button></td></tr>)}</tbody></table></div>}
      {data?.updatedAt && <p className="dash-muted">Diperbarui {new Date(data.updatedAt).toLocaleString('id-ID')}. Rekaman pricing untuk model yang tidak terhubung tetap tersimpan, tidak diterbitkan sebagai model baru.</p>}
    </section>
  </DashboardShell>;
}
