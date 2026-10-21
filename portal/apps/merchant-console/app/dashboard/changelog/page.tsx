import Link from 'next/link';
import { ChangelogTimeline } from '../../../components/changelog';
import { Heading } from '../../../components/ui';
import styles from '../../../components/changelog.module.css';

export default function ChangelogPage() {
  return (
    <div className={styles.page}>
      <Heading title="Changelog" description="Catatan pembaruan Axiom. Semua tanggal menggunakan tanggal rilis, tanpa perkiraan jam publikasi." />
      <Link className={styles.back} href="/dashboard">Kembali ke ringkasan</Link>
      <ChangelogTimeline detailed />
    </div>
  );
}
