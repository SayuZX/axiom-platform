import BrandLogo from './BrandLogo';
import styles from './LegalDocument.module.css';
import { legalReferences } from '../../lib/legal-content.mjs';

export default function LegalDocument({ document, kind }) {
  return <div className={`axiom-site ${styles.page}`} lang="id">
    <a className="skip-link" href="#main">Langsung ke isi dokumen</a>
    <header className={styles.header}><a href="/" aria-label="AXIOM AI beranda"><BrandLogo/></a><nav aria-label="Navigasi informasi"><a href="/terms" aria-current={kind === 'terms' ? 'page' : undefined}>Ketentuan</a><a href="/privacy" aria-current={kind === 'privacy' ? 'page' : undefined}>Privasi</a><a href="/changelog">Pembaruan</a><a href="/account">Akun</a></nav></header>
    <main id="main" tabIndex={-1}>
      <div className={styles.hero}><h1>{document.title}</h1><p>{document.summary}</p><p>Terakhir diperbarui: <time dateTime="2026-10-18">18 Oktober 2026</time><br/>Berlaku sejak versi ini dipublikasikan pada situs resmi; tidak berlaku surut terhadap transaksi yang telah disepakati.</p><p className={styles.notice}><strong>Hukum Republik Indonesia.</strong> Dokumen ini menjelaskan ketentuan layanan dan pelindungan pengguna berdasarkan peraturan Indonesia. Ketentuan yang bersifat wajib menurut undang-undang tetap berlaku dan tidak dapat dikesampingkan oleh dokumen ini.</p></div>
      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="Daftar isi dokumen"><h2>Isi dokumen</h2><ol>{document.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}<li><a href="#rujukan">Rujukan hukum Indonesia</a></li></ol></nav>
        <article className={styles.document} aria-label={document.title}>{document.sections.map(section => <section key={section.id} id={section.id} tabIndex={-1} aria-labelledby={`${section.id}-judul`}><h2 id={`${section.id}-judul`}>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}<section id="rujukan" tabIndex={-1} aria-labelledby="rujukan-judul"><h2 id="rujukan-judul">Rujukan hukum Indonesia</h2><ul>{legalReferences.map(reference => <li key={reference.href}><a href={reference.href}>{reference.label}</a></li>)}</ul><p>Baca juga <a href={kind === 'terms' ? '/privacy' : '/terms'}>{kind === 'terms' ? 'kebijakan privasi' : 'ketentuan layanan'}</a> dan <a href="/changelog">riwayat pembaruan produk</a>.</p></section></article>
      </div>
    </main>
    <footer className={styles.footer}><span>AXIOM AI · Axiom Creative</span><nav aria-label="Dokumen dan halaman terkait"><a href="/terms">Ketentuan layanan</a><a href="/privacy">Kebijakan privasi</a><a href="/changelog">Riwayat pembaruan</a><a href="/">Halaman utama</a></nav></footer>
  </div>;
}
