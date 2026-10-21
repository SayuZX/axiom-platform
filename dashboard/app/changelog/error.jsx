'use client';

import Link from 'next/link';
import styles from './changelog.module.css';

export default function ChangelogError({ reset }) {
  return <main className={styles.page}><section className={styles.empty} role="alert"><h1>Pembaruan belum dapat dimuat</h1><p>Coba lagi beberapa saat lagi.</p><div className={styles.filters}><button type="button" onClick={reset}>Coba lagi</button><Link href="/changelog">Kembali ke catatan perubahan</Link></div></section></main>;
}
