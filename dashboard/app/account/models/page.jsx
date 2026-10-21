'use client';

import { useState } from 'react';
import Link from 'next/link';
import DashboardShell from '../../components/DashboardShell';
import { DataState, date, number, useCustomerData } from '../components/CustomerData';
import styles from './models.module.css';

const idr = value => value == null ? 'Belum diatur' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

export default function ModelsPage() {
  const resource = useCustomerData('catalogue');
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const models = resource.data?.models || [];
  const providers = [...new Set(models.map(model => model.provider).filter(Boolean))].sort();
  const term = query.trim().toLowerCase();
  const visible = models.filter(model => (!provider || model.provider === provider) && (!term || [model.id, model.name, model.provider, model.description].some(value => value?.toLowerCase().includes(term))));

  return <DashboardShell title="Katalog model" description="Model terhubung, kapabilitas, dan tarif jual AXIOM CREATIVE. Akses mengikuti izin kunci Anda.">
    <section className={styles.catalogue} aria-label="Katalog model AI">
      <header className={styles.header}>
        <div><h2>Model AI</h2><p>Temukan model untuk kebutuhan Anda</p></div>
        <button className={styles.refresh} type="button" onClick={resource.reload} disabled={resource.loading}>{resource.loading ? 'Memuat…' : 'Perbarui'}</button>
      </header>
      <div className={styles.toolbar}>
        <label className={styles.search}><span>Cari model</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nama, ID, provider, atau deskripsi" /></label>
        <label className={styles.provider}><span>Provider</span><select value={provider} onChange={event => setProvider(event.target.value)}><option value="">Semua provider</option>{providers.map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className={styles.links}><Link href="/account/calculator">Hitung estimasi</Link><Link href="/account/updates">Spesifikasi & pembaruan</Link></div>
      <div className={styles.state}><DataState resource={resource} /></div>
      {resource.data && <>
        <div className={styles.sectionLabel}><span role="status">{number(visible.length)} dari {number(models.length)} model</span><span>Diperbarui {date(resource.data.updatedAt)}</span></div>
        {visible.length ? <ul className={styles.list}>{visible.map(model => <li key={model.id}>
          <details className={styles.model}>
            <summary>
              <span className={styles.avatar} aria-hidden="true">{(model.provider || 'Router').slice(0, 1).toUpperCase()}</span>
              <span className={styles.identity}><strong>{model.name || model.id}</strong><span>{model.provider || 'Router'}{model.badge ? ` · ${model.badge}` : ''}</span><code>{model.id}</code></span>
              <span className={styles.preview}><strong>{idr(model.inputPriceIdr)}</strong><span>Input / 1 juta token</span></span>
              <span className={styles.chevron} aria-hidden="true">›</span>
            </summary>
            <div className={styles.detail}>
              {model.description && <p className={styles.description}>{model.description}</p>}
              <dl className={styles.specs}>
                <div><dt>Konteks maksimum</dt><dd>{model.contextWindow == null ? 'Belum tersedia' : number(model.contextWindow) + ' token'}</dd></div>
                <div><dt>Output maksimum</dt><dd>{model.maxOutput == null ? 'Belum tersedia' : number(model.maxOutput) + ' token'}</dd></div>
                {[['Reasoning', model.reasoning], ['Vision', model.vision], ['Tools', model.tools]].map(([name, enabled]) => <div key={name}><dt>{name}</dt><dd>{enabled == null ? 'Belum diketahui' : enabled ? 'Ya' : 'Tidak'}</dd></div>)}
                <div><dt>Input / 1 juta token</dt><dd>{idr(model.inputPriceIdr)}</dd></div>
                <div><dt>Output / 1 juta token</dt><dd>{idr(model.outputPriceIdr)}</dd></div>
                <div><dt>Kelas harga</dt><dd>{model.priceTier || 'Belum ditetapkan'}</dd></div>
                <div><dt>Sumber tarif</dt><dd>{model.pricingSource === 'axiom-retail' ? 'Tarif jual AXIOM CREATIVE' : 'Belum diatur'}</dd></div>
              </dl>
              <div className={styles.detailActions}><Link href="/playground">Uji di Playground</Link><Link href="/account/updates">Spesifikasi lengkap</Link></div>
            </div>
          </details>
        </li>)}</ul> : <div className={styles.empty}><h3>{models.length ? 'Model tidak ditemukan' : 'Belum ada model'}</h3><p>{models.length ? 'Coba nama, ID, atau provider lain.' : 'Model terhubung akan muncul setelah tersedia dari router.'}</p>{(query || provider) && <button type="button" onClick={() => { setQuery(''); setProvider(''); }}>Reset filter</button>}</div>}
        <footer className={styles.footer}>Tarif jual AXIOM dalam IDR per 1 juta token. Ketersediaan katalog bukan jaminan akses atau kesehatan provider.</footer>
      </>}
    </section>
  </DashboardShell>;
}
