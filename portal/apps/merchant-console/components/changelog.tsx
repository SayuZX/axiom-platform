import Link from 'next/link';
import { changelog } from '../lib/changelog';
import styles from './changelog.module.css';

export function ChangelogTimeline({ detailed = false }: { detailed?: boolean }) {
  return (
    <ol className={`${styles.timeline} ${detailed ? styles.detailed : ''}`}>
      {changelog.map((release) => (
        <li key={release.id} id={detailed ? release.id : undefined}>
          <div className={styles.date}><time dateTime={release.date}>{release.dateLabel}</time><span>{release.label}</span></div>
          {detailed ? <h2>{release.title}</h2> : <h3><Link href={`/dashboard/changelog#${release.id}`}>{release.title}</Link></h3>}
          <p className={styles.summary}>{release.summary}</p>
          {detailed && release.sections.map((section) => (
            <section className={styles.section} key={section.title}>
              <h3>{section.title}</h3>
              <ul>{section.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            </section>
          ))}
        </li>
      ))}
    </ol>
  );
}

export function ChangelogPanel() {
  return (
    <aside className={styles.panel} aria-labelledby="changelog-title">
      <header className={styles.header}><h2 id="changelog-title">Changelog</h2><p>Perubahan terbaru di Axiom.</p></header>
      <ChangelogTimeline />
      <Link className={styles.viewAll} href="/dashboard/changelog">Lihat semua pembaruan</Link>
    </aside>
  );
}
