'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './updates.module.css';
import AnnouncementContent from './AnnouncementContent';
import Skeleton from './Skeleton';

export const updateCategories = ['NEW', 'UPDATE', 'FIX', 'MAINTENANCE', 'PRICING', 'SECURITY'];
const categoryLabels = { NEW: 'Baru', UPDATE: 'Pembaruan', FIX: 'Perbaikan', MAINTENANCE: 'Pemeliharaan', PRICING: 'Harga', SECURITY: 'Keamanan' };
const dateLabel = value => value ? new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '';
const relativeTime = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });
const exactTime = value => new Date(value).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Jakarta' });
function publicationAge(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return 'Baru saja';
  if (seconds < 3600) return relativeTime.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return relativeTime.format(-Math.floor(seconds / 3600), 'hour');
  return relativeTime.format(-Math.floor(seconds / 86400), 'day');
}

function useUpdates(endpoint) {
  const [state, setState] = useState({ items: [], loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ items: [], loading: true, error: '' });
    fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.items)) throw new Error('Pembaruan belum dapat dimuat. Periksa koneksi atau sesi akun Anda.');
      const now = Date.now();
      const items = data.items.filter(item => item.status === 'published' && Date.parse(item.published_at) <= now && (!item.expires_at || Date.parse(item.expires_at) > now)).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
      if (!controller.signal.aborted) setState({ items, loading: false, error: '' });
    }).catch(error => { if (!controller.signal.aborted) setState({ items: [], loading: false, error: error.message }); });
    return () => controller.abort();
  }, [endpoint, revision]);
  return { ...state, reload: () => setRevision(value => value + 1) };
}
function ResourceState({ resource }) {
  if (resource.loading) return <Skeleton rows={3} label="Memuat pembaruan…" />;
  if (resource.error) return <div className={styles.state} role="alert"><p>{resource.error}</p><button type="button" onClick={resource.reload}>Coba lagi</button></div>;
  return null;
}
function Badges({ item }) {
  return <div className={styles.badges}><span className={styles.badge} data-category={item.category}>{categoryLabels[item.category] || item.category}</span>{item.version && <span className={styles.version}>{item.version}</span>}<time dateTime={item.published_at}>{dateLabel(item.published_at)} WIB</time>{item.is_pinned && <span>Disematkan</span>}</div>;
}
function Timeline({ items }) {
  return <ol className={styles.timeline}>{items.map(item => <li key={item.id} id={`update-${item.slug || item.id}`}><article><Badges item={item} /><h3>{item.title}</h3><p>{item.summary}</p>{item.audience === 'public' ? <Link href={`/changelog/${item.slug}`}>Baca selengkapnya<span className={styles.srOnly}>: {item.title}</span></Link> : <a href={`/account/updates?article=${encodeURIComponent(item.slug || item.id)}`}>Baca selengkapnya<span className={styles.srOnly}>: {item.title}</span></a>}</article></li>)}</ol>;
}
export default function Updates({ endpoint = '/site-api/announcements' }) {
  const resource = useUpdates(endpoint);
  const [articleId, setArticleId] = useState(null);
  useEffect(() => { setArticleId(new URLSearchParams(window.location.search).get('article')); }, []);
  useEffect(() => {
    function revealLinkedUpdate() {
      const id = window.location.hash.slice(1);
      if (!id.startsWith('update-')) return;
      const target = document.getElementById(id);
      if (!target) return;
      const detail = target.querySelector('details');
      if (detail) detail.open = true;
      target.scrollIntoView({ block: 'start' });
    }
    revealLinkedUpdate();
    window.addEventListener('hashchange', revealLinkedUpdate);
    return () => window.removeEventListener('hashchange', revealLinkedUpdate);
  }, [resource.items]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const needle = query.trim().toLocaleLowerCase('id-ID');
  const items = resource.items.filter(item => (!category || item.category === category) && `${item.title} ${item.summary} ${item.content} ${item.version || ''}`.toLocaleLowerCase('id-ID').includes(needle));
  if (articleId) {
    const item = resource.items.find(item => String(item.slug || item.id) === articleId);
    return <section className={styles.updates} aria-label="Artikel pembaruan"><a href="/account/updates">← Kembali ke pembaruan</a><ResourceState resource={resource} />{!resource.loading && !resource.error && (item ? <article><Badges item={item} /><h2>{item.title}</h2><p>{item.summary}</p><AnnouncementContent content={item.content} /></article> : <p>Artikel tidak tersedia atau sudah berakhir.</p>)}</section>;
  }
  return <section className={`${styles.updates} ${styles.feed}`} aria-label="Daftar pembaruan"><div className={styles.filters}><label>Cari pembaruan<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Judul, isi, atau versi" /></label><label>Kategori<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Semua kategori</option>{updateCategories.map(value => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label></div><ResourceState resource={resource} />{!resource.loading && !resource.error && <><p className={styles.count} role="status">{items.length} pembaruan</p>{items.length ? <Timeline items={items} /> : <div className={styles.state}><h2>{resource.items.length ? 'Tidak ada hasil yang cocok' : 'Belum ada pembaruan'}</h2><p>{resource.items.length ? 'Coba kata kunci atau kategori lain.' : 'Pengumuman produk dan perubahan layanan akan tampil di sini.'}</p>{(query || category) && <button type="button" onClick={() => { setQuery(''); setCategory(''); }}>Reset filter</button>}</div>}</>}</section>;
}
export function FeaturedUpdates({ endpoint = '/account-api/announcements', href = '/account/updates' }) {
  const resource = useUpdates(endpoint);
  const [dismissed, setDismissed] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const stored = JSON.parse(sessionStorage.getItem('axiom-dismissed-updates') || '[]'); if (Array.isArray(stored)) setDismissed(stored.filter(value => typeof value === 'string')); } catch { /* Storage may be disabled; dismissal still works in memory. */ }
    setReady(true);
  }, []);
  const latest = resource.items[0];
  const key = latest ? `${latest.id}:${latest.updated_at}` : '';
  function dismiss() {
    const next = [...dismissed, key];
    setDismissed(next);
    try { sessionStorage.setItem('axiom-dismissed-updates', JSON.stringify(next)); } catch { /* Storage may be disabled. */ }
  }
  return <section className={styles.updates} aria-label="Pembaruan terbaru">
    <ResourceState resource={resource} />
    {!resource.loading && !resource.error && <>
      {latest && ready && !dismissed.includes(key) && <article className={styles.featured}>
        <div className={styles.featuredArt} aria-hidden="true">
          <svg viewBox="0 0 400 170" fill="none"><path d="M0 105h133v65H0z" fill="#6241eb"/><path d="M133 105h134v65H133z" fill="#c85d24"/><path d="M267 105h133v65H267z" fill="#178b48"/><path d="M16 105h26v26H16zm52 26h26v26H68zm39-26h26v26h-26" fill="#c9b91e"/><path d="M148 115h17v17h-17zm34 34h17v17h-17zm34-34h17v17h-17zm34 34h17v17h-17" fill="#b78aff"/><path d="M285 109h19v19h-19zm40 35h19v19h-19zm38-30h19v19h-19" fill="#6bec96"/><path d="m224 25 44 26v52l-44 26-44-26V51z" fill="#272238" stroke="#49405e"/><path d="m224 45 28 16v32l-28 16-28-16V61z" fill="#ebe8ff"/><path d="m209 86 15-30 15 30m-24-10h18" stroke="#5c3ed0" strokeWidth="5" strokeLinejoin="round"/><path d="M199 128h50l20 42h-90z" fill="#272238"/></svg>
        </div>
        <div className={styles.featuredHead}><h2>{latest.title}</h2><button type="button" onClick={dismiss} aria-label={`Tutup pengumuman ${latest.title}`}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
        <div className={styles.featuredDescription}><p>{latest.summary}</p></div>
        <div className={styles.featuredAction}><Link href={latest.audience === 'public' ? `/changelog/${latest.slug}` : `${href}#update-${latest.slug || latest.id}`}>Lihat pembaruan</Link></div>
      </article>}
      <div className={styles.latestPanel}><div className={styles.sectionHead}><h2>Terbaru dari catatan perubahan</h2></div>{resource.items.length ? <ol className={styles.timeline}>{resource.items.slice(0, 4).map(item => <li key={item.id}><time className={styles.count} dateTime={item.published_at} title={exactTime(item.published_at)}>{publicationAge(item.published_at)}</time><h3><Link href={item.audience === 'public' ? `/changelog/${item.slug}` : `${href}#update-${item.slug || item.id}`}>{item.title}</Link></h3></li>)}</ol> : <p className={styles.emptyTimeline}>Belum ada pembaruan yang diterbitkan. Kabar produk akan muncul di sini.</p>}<Link className={styles.allUpdates} href={href}>Lihat catatan perubahan <span aria-hidden="true">→</span></Link></div>
    </>}
  </section>;
}
