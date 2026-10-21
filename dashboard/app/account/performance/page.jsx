'use client';

import Link from 'next/link';
import DashboardShell from '../../components/DashboardShell';
import { DataState, date, number, useCustomerData } from '../components/CustomerData';
import styles from './performance.module.css';

export default function PerformancePage() {
  const resource = useCustomerData('performance'), data = resource.data;
  const latencyRows = (data?.usage ?? []).filter(row => Number.isFinite(row.averageTotalMs) && row.averageTotalMs >= 0);
  const maxLatency = latencyRows.reduce((max, row) => Math.max(max, row.averageTotalMs), 0);
  return <DashboardShell title="Peringkat & TPS" description="Performa model berdasarkan pengukuran yang tersedia.">
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div><span className={styles.eyebrow}>PERINGKAT & TPS</span><h2 className={styles.title}>Performa model</h2></div>
        <div className={styles.actions}><Link className="dash-button" href="/account/logs">Log Permintaan API</Link><button className="dash-button" type="button" disabled={resource.loading} onClick={resource.reload}>{resource.loading ? 'Memperbarui…' : 'Perbarui metrik'}</button></div>
      </div>
      <DataState resource={resource} />
      {data && <>
        <section className={styles.generation} aria-label="Ketersediaan metrik generasi">
          <div className={styles.generationIntro}><span className={styles.eyebrow}>KECEPATAN GENERASI</span><h2>Tokens per second</h2><p>Token output per detik selama generasi terukur.</p><span className={styles.availability}>Belum terukur</span></div>
          <dl><div><dt>TPS</dt><dd>— <span>token/detik</span></dd></div><div><dt>Token pertama · TTFT</dt><dd>— <span>ms</span></dd></div></dl>
          <p className={styles.generationNote}>Grafik dan peringkat TPS belum tersedia. Ledger belum mencatat interval generasi; durasi request bukan penggantinya.</p>
        </section>
        <dl className={styles.metrics} aria-label="Konteks data pemakaian">
          <div><dt>Periode pemakaian</dt><dd>{number(data.window.days)} <span>hari</span></dd><p>Sejak {date(data.window.since)}</p></div>
          <div><dt>Model / penyedia</dt><dd>{number(data.usage.length)}</dd><p>Pasangan tercatat dalam ledger</p></div>
          <div><dt>Pembaruan ledger terakhir</dt><dd className={styles.timestamp}>{data.lastUpdatedAt ? date(data.lastUpdatedAt) : 'Belum tersedia'}</dd><p>Bukan waktu refresh halaman</p></div>
        </dl>
        <section className={styles.latency} aria-labelledby="latency-heading">
          <div className={styles.sectionHeading}>
            <div><h2 id="latency-heading">Durasi request rata-rata</h2><p>Historis {number(data.window.days)} hari · sejak request dimulai hingga selesai, bukan TPS atau TTFT.</p></div>
            <span className={styles.unit}>HISTORIS · ms</span>
          </div>
          {latencyRows.length ? <ul className={styles.bars} aria-label="Durasi request rata-rata per model">
            {latencyRows.map(row => <li className={styles.barRow} key={`${row.provider}/${row.model}`}>
              <div className={styles.model}><span className={styles.avatar} aria-hidden="true">{(row.modelLabel || row.model || 'M').slice(0, 1).toUpperCase()}</span><div><strong>{row.modelLabel}</strong><small>{row.provider} / {row.model}</small></div></div>
              <div className={styles.track} title={`${row.modelLabel}: ${number(row.averageTotalMs)} ms`} aria-hidden="true"><span style={{ width: `${maxLatency ? row.averageTotalMs / maxLatency * 100 : 0}%` }} /></div>
              <span className={styles.value}>{number(row.averageTotalMs)} <small>ms</small></span>
            </li>)}
          </ul> : <p className={styles.empty}>Belum ada durasi request yang tersedia dalam periode ini.</p>}
          <p className={styles.chartNote}>Hanya model dengan durasi valid ditampilkan. Panjang batang relatif terhadap durasi tertinggi.</p>
        </section>
      </>}
    </div>
    {data && <section className="dash-card">
      <h2>Pemakaian per model · {data.window.days} hari</h2><p className="dash-muted">{data.source}</p>
      <p>Token hanya menjumlahkan nilai diketahui dari permintaan selesai. Jumlah usage belum lengkap dan masih sementara dapat tumpang tindih; total sebagian bukan total lengkap.</p>
      {!data.usage.length ? <p>Belum ada permintaan dalam periode ini.</p> : <div className="dash-table-wrap" tabIndex={0} role="region" aria-label="Pemakaian per model"><table className="dash-table"><thead><tr><th>Model</th><th>Permintaan</th><th>Input tercatat</th><th>Output tercatat</th><th>Total tercatat</th><th>Kelengkapan</th><th>Usage belum lengkap</th><th>Masih sementara</th><th>Token dipotong</th><th>Biaya (Rp)</th><th>Durasi rata-rata (ms)</th><th>Pembaruan data</th></tr></thead><tbody>{data.usage.map(row => <tr key={`${row.provider}/${row.model}`}><td>{row.modelLabel}<small style={{ display: 'block' }}>{row.provider} / {row.model}</small></td><td>{number(row.requests)}</td><td>{number(row.promptTokens)}</td><td>{number(row.completionTokens)}</td><td>{number(row.totalTokens)}</td><td>{{ complete: 'Lengkap', partial: 'Sebagian', unavailable: 'Tidak tersedia', empty: 'Kosong' }[row.usageCompleteness]}</td><td>{number(row.unavailableUsageRequests)}</td><td>{number(row.provisionalRequests)}</td><td>{number(row.debitTokens)}</td><td>{number(row.saleCostIdr)}</td><td>{number(row.averageTotalMs)}</td><td>{date(row.lastUpdatedAt == null ? null : new Date(row.lastUpdatedAt).toISOString())}</td></tr>)}</tbody></table></div>}
      <p className="dash-muted">Durasi memakai waktu mulai dan selesai permintaan. TPS dan TTFT tidak tersedia tanpa pengukuran generasi; tidak ada benchmark buatan.</p>
    </section>}
  </DashboardShell>;
}
