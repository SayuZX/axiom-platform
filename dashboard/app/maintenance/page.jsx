'use client';
import GlobalFeedback from '../components/GlobalFeedback';
import { useEffect, useState } from 'react';
import styles from './maintenance.module.css';

export default function MaintenancePage() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/site-api/maintenance', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Status belum dapat dimuat. Muat ulang untuk mencoba lagi.');
        return response.json();
      })
      .then(setSettings)
      .catch(error => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, []);

  const end = settings?.estimatedEnd ? new Date(settings.estimatedEnd) : null;
  const validEnd = end && Number.isFinite(end.getTime());

  return (
    <main className={styles.page}>
      <div className={styles.notebook}>
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="AXIOM AI beranda">
            AXIOM<span>AI</span>
          </a>
          <span className={styles.meta}>Catatan layanan</span>
        </header>

        <section className={styles.note} aria-labelledby="maintenance-title">
          <span className={styles.tape} aria-hidden="true" />
          <div className={styles.stamp}>
            {settings ? (settings.enabled ? 'Sedang maintenance' : 'Pratinjau • maintenance nonaktif') : 'Status layanan'}
          </div>
          <svg className={styles.doodle} viewBox="0 0 160 120" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M27 25 126 21 130 86 24 90Z M32 31 119 29 122 77 32 82Z M64 90 63 103 92 101 91 88 M48 106 109 104" />
            <path d="m57 48-10 10 12 9m37-22 10 10-10 11m-15-24-9 27" />
            <path d="m137 14 8-7m-5 26 12-1m-13 16 8 6" />
          </svg>
          <h1 id="maintenance-title">
            {settings?.title || (error ? 'Status belum tersedia.' : 'Sebentar, sedang dirapikan.')}
          </h1>
          {!settings && !error && <p role="status">Memuat catatan terbaru…</p>}
          {error && <GlobalFeedback>{error}</GlobalFeedback>}
          {settings && (
            <>
              <p className={styles.message}>{settings.message}</p>
              <div className={styles.impact}>
                <span className={styles.underline}>Website + API model</span>
                <p>
                  {settings.enabled
                    ? 'Untuk sementara, website dan permintaan API model tidak tersedia. Coba kembali setelah maintenance selesai.'
                    : 'Maintenance belum aktif. Halaman ini adalah pratinjau pemberitahuan; website dan API model tidak dinonaktifkan oleh pengaturan maintenance.'}
                </p>
              </div>
              <p className={styles.estimate}>
                {validEnd ? (
                  <>
                    Perkiraan selesai: <time dateTime={end.toISOString()}>{end.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' })} WIB</time>. Waktu ini perkiraan, bukan jaminan.
                  </>
                ) : (
                  'Belum ada perkiraan waktu selesai. Tidak ada hitung mundur sampai waktunya dikonfirmasi.'
                )}
              </p>
            </>
          )}
          <div className={styles.actions}>
            <button type="button" onClick={() => window.location.reload()}>Muat ulang status</button>
            <a href="/">Coba buka website</a>
          </div>
          <p className={styles.footerNote}>Akses login, admin, dan webhook pembayaran tetap tersedia selama maintenance.</p>
        </section>

        <footer className={styles.footer}>
          <span>AXIOM AI</span>
          <span>Terima kasih sudah menunggu.</span>
        </footer>
      </div>
    </main>
  );
}
