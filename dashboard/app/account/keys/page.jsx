'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import DashboardShell from '../../components/DashboardShell';
import Icon from '../../components/Icon';
import Skeleton from '../../components/Skeleton';
import { Alert, customerRequest, DataState, date, number, useCustomerData } from '../components/CustomerData';
import { keyQuota, keyStatus, matchesKey } from './key-state.mjs';
import './keys.css';

const statuses = { active: 'Aktif', expired: 'Kedaluwarsa', exhausted: 'Kuota habis', revoked: 'Dicabut / nonaktif' };
function ModelList({ models, empty }) {
  return !models?.length ? <p>{empty}</p> : models.includes('*') ? <p>Semua model</p> : <ul className="keys-model-list">{models.map(model => <li key={model}><code>{model}</code></li>)}</ul>;
}

function KeyCard({ item, reload, now = Date.now() }) {
  const [name, setName] = useState(item.name || '');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const alive = useRef(true);
  const status = keyStatus(item, now), quota = keyQuota(item);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run(kind, work) {
    if (lock.current) return;
    lock.current = true; setBusy(kind); setError(''); setNotice('');
    try { await work(); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  }
  function action(input) {
    return run('save', async () => {
      await customerRequest(`keys/${encodeURIComponent(item.id)}`, { method: 'POST', body: JSON.stringify(input) });
      if (alive.current) { setSecret(''); reload(); }
    });
  }
  function reveal() {
    if (secret) { setSecret(''); setNotice(''); return; }
    return run('reveal', async () => {
      const data = await customerRequest(`keys/${encodeURIComponent(item.id)}/reveal`, { method: 'POST', body: '{}' });
      if (typeof data.key !== 'string' || !data.key) throw new Error('Kunci tidak tersedia. Perbarui data lalu coba lagi.');
      if (alive.current) setSecret(data.key);
    });
  }
  function copy() {
    if (!secret) return;
    return run('copy', async () => {
      try { await navigator.clipboard.writeText(secret); }
      catch { throw new Error('Clipboard tidak tersedia. Salin dari kolom kunci secara manual.'); }
      if (alive.current) setNotice('Kunci disalin. Simpan hanya di lingkungan privat.');
    });
  }
  return <article className={`keys-card keys-${status}`} aria-label={`Kunci ${item.name || item.id}`} aria-busy={Boolean(busy)}>
    <header className="keys-card-head"><span className="keys-symbol"><Icon name="keys" /></span><div className="keys-identity"><h2>{item.name || 'Kunci tanpa nama'}</h2><p>ID <code>{item.id}</code></p></div><span className={`keys-badge keys-${status}`}>{statuses[status]}</span></header>
    <div className="keys-card-body">
      <div className="keys-quota"><div className="keys-quota-heading"><span>Token tersisa</span><strong>{quota.remaining === null ? 'Tanpa batas kuota' : number(quota.remaining)}</strong></div>
        {quota.percent !== null ? <><meter className="keys-meter" min="0" max="100" value={quota.percent} aria-label="Persentase kuota token tersisa">{number(quota.percent)}%</meter><div className="keys-quota-caption"><span>{number(quota.used)} terpakai</span><span>dari {number(quota.limit)} token</span></div></> : <p className="keys-unlimited">Tidak dibatasi oleh konfigurasi admin. {number(quota.used)} token terpakai.</p>}
        {status !== 'active' && <p className="keys-unavailable">{status === 'revoked' ? 'Kunci ini nonaktif; sisa kuota tidak dapat digunakan.' : status === 'expired' ? 'Masa berlaku berakhir; sisa kuota tidak dapat digunakan.' : 'Kuota token telah habis; kunci tidak siap digunakan.'}</p>}
      </div>
      <dl className="keys-limits"><div><dt>Kedaluwarsa</dt><dd>{item.expiresAt ? date(item.expiresAt) : 'Tanpa tanggal kedaluwarsa'}</dd></div><div><dt>Permintaan / menit</dt><dd>{item.rpmLimit > 0 ? `${number(item.rpmLimit)} RPM` : 'Tanpa batas RPM'}</dd></div><div><dt>Token / menit</dt><dd>{item.tpmLimit > 0 ? `${number(item.tpmLimit)} TPM` : 'Tanpa batas TPM'}</dd></div></dl>
      <details className="keys-models"><summary>Akses model <span>{item.blockedModels?.length ? 'Ada pembatasan' : !item.allowedModels?.length || item.allowedModels.includes('*') ? 'Semua model' : `${number(item.allowedModels.length)} diizinkan`}</span></summary><div className="keys-model-columns"><section><h3>Diizinkan</h3><ModelList models={item.allowedModels} empty="Semua model" /></section><section><h3>Diblokir</h3><ModelList models={item.blockedModels} empty="Tidak ada model diblokir" /></section></div><p className="dash-muted">Blokir selalu diutamakan, termasuk pada model yang diizinkan.</p></details>
      <Alert>{error}</Alert><Alert info>{notice}</Alert>
      <div className="keys-secret">{busy==='reveal'?<Skeleton rows={1}/>:<label className="dash-field">Kunci rahasia<input readOnly value={secret || '••••••••••••••••••••••••'} aria-label={secret ? 'Kunci rahasia ditampilkan' : 'Kunci rahasia disembunyikan'} autoComplete="off" autoCorrect="off" spellCheck={false} onFocus={event => { if (secret) event.target.select(); }} /></label>}<div className="dash-actions"><button type="button" className="dash-button" disabled={Boolean(busy) && !secret} onClick={reveal}>{secret ? 'Sembunyikan kunci' : 'Tampilkan kunci'}</button>{secret && <button type="button" className="dash-button" disabled={Boolean(busy)} onClick={copy}>Salin kunci</button>}</div>{secret && <p className="dash-muted">Jangan masukkan kunci ke repositori publik, kode browser, atau tangkapan layar.</p>}</div>
      <details className="keys-manage"><summary>Kelola nama & pencabutan</summary><form className="keys-rename" onSubmit={event => { event.preventDefault(); if (name.trim() && name.trim() !== item.name) action({ name: name.trim() }); }}><label className="dash-field">Nama kunci<input value={name} onChange={event => setName(event.target.value)} maxLength={160} required disabled={Boolean(busy)} /></label><button className="dash-button" disabled={Boolean(busy) || !name.trim() || name.trim() === item.name}>Simpan nama</button></form>{item.isActive ? <div className="keys-revoke"><p>Pencabutan menghentikan integrasi. Kunci tidak dapat diaktifkan kembali dari halaman ini.</p><button type="button" className="dash-button keys-danger" disabled={Boolean(busy)} onClick={async () => { if (!lock.current && await window.axiomConfirm({message: 'Cabut kunci ini? Integrasi yang memakai kunci ini akan ditolak. Halaman pelanggan tidak dapat mengaktifkannya kembali.'}) && alive.current && !lock.current) action({ isActive: false }); }}>Cabut kunci</button></div> : <p className="dash-muted">Kunci nonaktif tidak dapat diaktifkan kembali dari halaman ini.</p>}</details>
    </div>
  </article>;
}

export default function KeysPage() {
  const resource = useCustomerData('keys');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const keys = resource.data?.keys || [];
  const visible = keys.filter(item => matchesKey(item, query, filter, now));
  const totals = { active: 0, expired: 0, exhausted: 0, revoked: 0 };
  for (const item of keys) totals[keyStatus(item, now)]++;
  return <DashboardShell title="Kunci API" description="Pantau akses, sisa token, dan masa berlaku kunci paket Anda. Nama dan pencabutan tidak mengubah kuota.">
    <div className="keys-workspace"><div className="keys-toolbar"><span className="keys-caption">Akses dari paket terverifikasi</span><div className="dash-actions"><Link className="dash-button" href="/account/setup">Setup integrasi</Link><Link className="dash-button dash-button-primary" href="/buy"><Icon name="tokens" size={16}/> Beli paket token</Link><button className="dash-button" disabled={resource.loading} onClick={resource.reload}>Perbarui kunci</button></div></div>
      {resource.loading?<Skeleton rows={5}/>:<DataState resource={resource} />}
      {resource.data && <><div className="keys-status-strip" aria-label="Ringkasan status kunci">{Object.entries(statuses).map(([status, label]) => <div className={`keys-total keys-${status}`} key={status}><span>{label}</span><strong>{number(totals[status])}</strong></div>)}</div>
        {keys.length ? <><div className="keys-filter"><label className="dash-field">Cari kunci<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nama atau ID kunci" autoComplete="off" /></label><label className="dash-field">Status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Semua status</option>{Object.entries(statuses).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label><p role="status">{number(visible.length)} dari {number(keys.length)} kunci</p></div>
          {visible.length ? <div className="keys-list">{visible.map(item => <KeyCard item={item} key={item.id} reload={resource.reload} now={now} />)}</div> : <section className="keys-empty"><span>Tidak ada hasil</span><button className="dash-button" onClick={() => { setQuery(''); setFilter('all'); }}>Hapus filter</button></section>}</> : <section className="keys-empty"><span>0 kunci</span><Link className="dash-button" href="/account/billing">Lihat transaksi</Link></section>}
      </>}
    </div>
  </DashboardShell>;
}
