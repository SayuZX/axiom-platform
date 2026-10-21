'use client';

import { useState } from 'react';
import Link from 'next/link';
import DashboardShell from '../../components/DashboardShell';
import { DataState, date, number, useCustomerData } from '../components/CustomerData';
import styles from './quota-history.module.css';

export default function QuotaHistoryPage() {
  const [page, setPage] = useState(1);
  const resource = useCustomerData(`quota-history?page=${page}`);
  const data = resource.data;

  return <DashboardShell title="Riwayat kuota" description="Catatan kuota kunci API yang telah habis pada akun Anda.">
    <div className={styles.history}>
      <div className={styles.toolbar}>
        <div className={styles.actions}>
          <button type="button" className="dash-button" disabled={resource.loading} onClick={resource.reload}>{resource.loading ? 'Memuat…' : 'Perbarui riwayat'}</button>
          <Link className="dash-button dash-button-primary" href="/buy">Beli paket baru</Link>
        </div>
      </div>

      {(resource.loading || resource.error) && <DataState resource={resource} />}
      {!resource.loading && !resource.error && data && <p className={styles.checked} role="status">{resource.unchanged ? 'Tidak ada catatan baru. ' : ''}Diperiksa {date(data.checkedAt)}</p>}

      {data && <section className={styles.panel} aria-labelledby="quota-history-heading" aria-busy={resource.loading}>
        <div className={styles.heading}>
          <h2 id="quota-history-heading">Kuota habis</h2>
          <span>{number(data.total)} catatan</span>
        </div>
        <p className={styles.note}>Kunci disamarkan; hanya empat karakter terakhir ditampilkan. Waktu habis yang tidak tercatat ditandai sebagai tidak tersedia.</p>
        {data.events.length === 0 ? <div className={styles.empty}>
          <h3>Belum ada riwayat kuota habis</h3>
          <p>Belum ada kuota yang tercatat habis. Riwayat akan muncul di halaman ini saat kuota Anda habis, dan tetap tersimpan setelah isi ulang.</p>
        </div> : <ul className={styles.events} aria-label="Catatan kuota habis">
          {data.events.map(event => <li key={event.id} className={styles.event}>
            <div className={styles.key}>
              <h3>{event.keyName || 'Kunci tanpa nama'}</h3>
              <span className={styles.suffix}>{event.keySuffix ? <><span className={styles.srOnly}>Kunci berakhiran </span><span aria-hidden="true">•••• </span>{String(event.keySuffix).slice(-4)}</> : 'Akhiran kunci tidak tersedia'}</span>
            </div>
            <dl className={styles.details}>
              <div><dt>Paket</dt><dd>{event.packageName || 'Tidak tersedia'}</dd></div>
              <div><dt>Token terpakai / batas</dt><dd className={styles.numeric}>{number(event.tokensUsed)} <span className={styles.separator}>/</span> {number(event.tokenLimit)}</dd></div>
              <div><dt>Waktu kuota habis</dt><dd>{date(event.exhaustedAt) === '—' ? 'Tidak tersedia' : <time dateTime={event.exhaustedAt}>{date(event.exhaustedAt)}</time>}</dd><dt className={styles.recordedLabel}>Dicatat</dt><dd className={styles.recorded}>{date(event.recordedAt) === '—' ? 'Tidak tersedia' : <time dateTime={event.recordedAt}>{date(event.recordedAt)}</time>}</dd></div>
            </dl>
          </li>)}
        </ul>}
        <nav className={styles.pagination} aria-label="Halaman riwayat kuota">
          <button className="dash-button" type="button" disabled={resource.loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>Sebelumnya</button>
          <span>Halaman {number(data.page)} dari {number(Math.max(1, data.totalPages))}</span>
          <button className="dash-button" type="button" disabled={resource.loading || data.page >= data.totalPages} onClick={() => setPage(data.page + 1)}>Berikutnya</button>
        </nav>
      </section>}
      <p className={styles.footnote}>Perlu kuota lagi? <Link href="/buy">Pilih paket baru</Link>. Pembelian paket mengikuti proses aktivasi; catatan ini bukan status kuota kunci saat ini.</p>
    </div>
  </DashboardShell>;
}
