import Link from 'next/link';
import { notFound } from 'next/navigation';
import AnnouncementContent from '../../components/AnnouncementContent';
import SiteHeader from '../../components/SiteHeader';
import { publicUpdates, categoryLabels, dateLabel } from '../data';
import styles from '../changelog.module.css';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function article(params) {
  const { slug } = await params;
  const item = publicUpdates().find(update => update.slug === slug);
  if (!item) notFound();
  return item;
}
export async function generateMetadata({ params }) {
  const item = await article(params);
  return {
    title: `${item.title} | AXIOM Changelog`, description: item.summary,
    alternates: { canonical: `/changelog/${item.slug}` },
    openGraph: { type: 'article', title: item.title, description: item.summary, url: `/changelog/${item.slug}`, publishedTime: item.published_at, modifiedTime: item.updated_at },
  };
}
export default async function ChangelogArticle({ params }) {
  const item = await article(params);
  const related = publicUpdates().filter(update => update.id !== item.id).sort((a, b) => Number(b.category === item.category) - Number(a.category === item.category)).slice(0, 3);
  const minutes = Math.max(1, Math.ceil(item.content.trim().split(/\s+/u).length / 200));
  return <div className="axiom-site"><SiteHeader /><main className={`${styles.page} ${styles.articlePage}`}>
    <Link className={styles.back} href="/changelog">← Kembali ke catatan perubahan</Link>
    <article><header className={styles.articleHeader}><div className={styles.meta}><Link className={styles.badge} data-category={item.category} href={`/changelog?category=${item.category}`}>{categoryLabels[item.category]}</Link>{item.version && <span>{item.version}</span>}</div><p className={styles.meta}><time dateTime={item.published_at} title={new Date(item.published_at).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Jakarta' })}>{dateLabel(item.published_at)} WIB</time><span>· {minutes} menit baca</span></p><h1>{item.title}</h1><p className={styles.lead}>{item.summary}</p></header>
    <div className={styles.content}><AnnouncementContent content={item.content} /></div>
    </article>
    {related.length > 0 && <aside className={styles.related} aria-labelledby="related-heading"><h2 id="related-heading">Pembaruan terkait</h2><div>{related.map(update => <article key={update.id}><div className={styles.meta}><time dateTime={update.published_at}>{dateLabel(update.published_at)}</time><span className={styles.badge}>{categoryLabels[update.category]}</span></div><h3><Link href={`/changelog/${update.slug}`}>{update.title}</Link></h3><p>{update.summary}</p></article>)}</div></aside>}
  </main></div>;
}
