import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import { publicUpdates, categoryLabels, dateLabel, monthLabel } from './data';
import styles from './changelog.module.css';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata = {
  title: 'Pembaruan produk | AXIOM',
  description: 'Pengumuman fitur baru, perbaikan, keamanan, harga, dan pemeliharaan layanan AXIOM.',
  alternates: { canonical: '/changelog' },
};

export default async function ChangelogPage({ searchParams }) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.slice(0, 200) : '';
  const category = Object.hasOwn(categoryLabels, params.category) ? params.category : '';
  const needle = query.trim().toLocaleLowerCase('id-ID');
  const items = publicUpdates().filter(item => (!category || item.category === category) && `${item.title} ${item.summary} ${item.content} ${item.version}`.toLocaleLowerCase('id-ID').includes(needle));
  const groups = Map.groupBy(items, item => monthLabel(item.published_at));
  return <div className="axiom-site"><SiteHeader /><main className={styles.page}>
    <header className={styles.hero}><Link href="/">Kembali ke beranda</Link><p className={styles.eyebrow}>AXIOM CHANGELOG</p><h1>Pembaruan produk</h1><p>Fitur baru, penyempurnaan, dan perbaikan layanan AXIOM. Ikuti setiap perubahan di satu tempat.</p></header>
    <form action="/changelog" className={styles.filters} role="search"><label>Cari pembaruan<input type="search" name="q" defaultValue={query} placeholder="Judul, isi, atau versi" maxLength={200} /></label><label>Kategori<select name="category" defaultValue={category}><option value="">Semua kategori</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="submit">Tampilkan</button>{(query || category) && <Link href="/changelog">Hapus filter</Link>}</form>
    <p className={styles.count}>{items.length} pembaruan · Tanggal dalam WIB</p>
    {[...groups].map(([month, entries]) => <section className={styles.month} key={month} aria-label={month}><h2>{month}</h2><ol className={styles.entries}>{entries.map(item => <li key={item.id}><article><div className={styles.meta}><time dateTime={item.published_at}>{dateLabel(item.published_at)}</time><span className={styles.badge} data-category={item.category}>{categoryLabels[item.category]}</span>{item.version && <span>{item.version}</span>}</div><h3><Link href={`/changelog/${item.slug}`}>{item.title}</Link></h3><p>{item.summary}</p><Link className={styles.readMore} href={`/changelog/${item.slug}`}>Baca selengkapnya<span className={styles.srOnly}>: {item.title}</span><span aria-hidden="true"> →</span></Link></article></li>)}</ol></section>)}
    {!items.length && <section className={styles.empty}><h2>{query || category ? 'Tidak ada pembaruan yang cocok' : 'Belum ada pembaruan publik'}</h2><p>{query || category ? 'Coba kata kunci atau kategori lain.' : 'Catatan perubahan akan muncul di sini setelah diterbitkan.'}</p></section>}
  </main></div>;
}
