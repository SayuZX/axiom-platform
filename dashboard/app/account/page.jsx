'use client';

import { useState } from 'react';
import Link from 'next/link';
import DashboardShell from '../components/DashboardShell';
import Icon from '../components/Icon';
import { FeaturedUpdates } from '../components/Updates';
import { DataState, number, useCustomerData } from './components/CustomerData';
import './overview.css';

const tools = [
  ['/account/logs', 'Log permintaan', 'Riwayat metadata penggunaan kunci Anda.'],
  ['/account/performance', 'Performa model', 'Pemakaian dan timing Playground akun ini.'],
  ['/account/keys', 'API keys', 'Kuota, kedaluwarsa, nama, dan pencabutan kunci.'],
  ['/account/setup', 'Setup cepat', 'Unduh konfigurasi untuk kunci aktif Anda.'],
  ['/playground', 'Playground', 'Kirim permintaan nyata menggunakan kuota paket.'],
  ['/account/models', 'Katalog model', 'Model terhubung beserta kapabilitas dan tarif.'],
  ['/account/status', 'Status layanan', 'Pemeriksaan langsung router dan pembayaran.'],
  ['/account/billing', 'Billing dan saldo', 'Top up, pembelian paket, dan transaksi Anda.'],
  ['/account/calculator', 'Kalkulator token', 'Hitung estimasi dari tarif katalog yang sama.'],
];
const shortDate = value => new Date(`${value}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });

function Activity({ activity, children }) {
  const [metric, setMetric] = useState('requests');
  const label = metric === 'requests' ? 'Jumlah permintaan API' : metric === 'debitTokens' ? 'Token yang dipotong dari kuota paket' : 'Token tercatat dari permintaan selesai';
  const maximum = Math.max(0, ...activity.map(day => day[metric] ?? 0));
  const ceiling = maximum ? Math.ceil(maximum / 4) * 4 : 4;
  const step = 600 / Math.max(activity.length, 1);
  return <section className="overview-panel overview-activity" aria-labelledby="activity-heading">
    <div className="overview-panel-head"><div><h2 id="activity-heading">Aktivitas API</h2><p>30 hari terakhir · Waktu UTC</p></div><div className="overview-toggle" role="group" aria-label="Metrik aktivitas">{[['requests', 'Permintaan API'], ['debitTokens', 'Token yang dipotong'], ['totalTokens', 'Token input dan output']].map(([value, title]) => <button type="button" key={value} aria-pressed={metric === value} onClick={() => setMetric(value)}>{title}</button>)}</div></div>
    <>
      {activity.some(day => ['partial', 'unavailable'].includes(day.usageCompleteness)) && <p role="status">Token hanya menjumlahkan nilai tercatat dari permintaan selesai. Sebagian usage belum tersedia atau masih sementara; lihat jumlah per hari.</p>}
      <div className="overview-chart" aria-live="polite">
        <svg viewBox="0 0 700 260" role="img" aria-labelledby="activity-chart-title activity-chart-description">
          <title id="activity-chart-title">{label} per hari selama 30 hari terakhir</title>
          <desc id="activity-chart-description">{maximum ? `Nilai harian tertinggi yang tersedia ${number(maximum)}. Angka lengkap tersedia pada tabel di bawah grafik.` : `${label}: belum ada nilai positif yang tersedia.`}</desc>
          <text x="62" y="16" className="overview-axis-label">{label}</text>
          {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="62" x2="662" y1={216 - tick * 44} y2={216 - tick * 44} className="overview-gridline" /><text x="52" y={220 - tick * 44} textAnchor="end">{compact.format(ceiling * tick / 4)}</text></g>)}
          {activity.map((day, index) => {
            const value = day[metric];
            return value > 0 && <rect key={day.date} x={62 + index * step + step * .2} y={216 - value / ceiling * 176} width={step * .6} height={value / ceiling * 176} rx="2" className={`overview-bar overview-bar-${metric}`}><title>{shortDate(day.date)}: {number(value)} {label.toLowerCase()}</title></rect>;
          })}
          {activity.length > 0 && [...new Set([0, Math.floor((activity.length - 1) / 3), Math.floor((activity.length - 1) * 2 / 3), activity.length - 1])].map(index => <text key={index} x={62 + (index + .5) * step} y="246" textAnchor="middle">{shortDate(activity[index].date)}</text>)}
        </svg>
      </div>
      <details className="overview-data"><summary>Lihat data harian</summary><div className="overview-table-scroll" tabIndex={0} role="region" aria-label="Tabel aktivitas harian"><table><caption>Token tercatat dari permintaan selesai per tanggal UTC</caption><thead><tr><th scope="col">Tanggal</th><th scope="col">Permintaan API</th><th scope="col">Input tercatat</th><th scope="col">Output tercatat</th><th scope="col">Total tercatat</th><th scope="col">Token dipotong</th><th scope="col">Usage belum lengkap</th><th scope="col">Masih sementara</th></tr></thead><tbody>{activity.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{number(day.requests)}</td><td>{number(day.promptTokens)}</td><td>{number(day.completionTokens)}</td><td>{number(day.totalTokens)}</td><td>{number(day.debitTokens)}</td><td>{number(day.unavailableUsageRequests)}</td><td>{number(day.provisionalRequests)}</td></tr>)}</tbody></table></div></details>
    </>
    {children}
  </section>;
}

export default function Account() {
  const resource = useCustomerData('overview');
  const data = resource.data;
  const compositionTotal = data?.usage.promptTokens != null && data?.usage.completionTokens != null ? data.usage.promptTokens + data.usage.completionTokens : 0;
  return <DashboardShell title="Ringkasan akun" description="Aktivitas API dan kuota token Anda.">
    <div className="account-overview">
      <div className="overview-main">
      <DataState resource={resource} />
      {data && <>
        <div className="overview-toolbar"><p><span className="overview-period">{data.window.days} hari terakhir</span><span>Ringkasan akun Anda</span></p><button type="button" className="dash-button" disabled={resource.loading} onClick={resource.reload}>Perbarui ringkasan</button></div>
        <p>Permintaan: {number(data.usage.requests)} · Biaya tercatat (Rp): {number(data.usage.saleCostIdr)} · Durasi rata-rata (ms): {number(data.usage.averageTotalMs)}</p>
        <p role="status">Kelengkapan usage: {{ complete: 'Lengkap', partial: 'Sebagian — bukan total lengkap', unavailable: 'Tidak tersedia', empty: 'Belum ada permintaan' }[data.usage.usageCompleteness]}. Usage belum lengkap: {number(data.usage.unavailableUsageRequests)} permintaan · Masih sementara: {number(data.usage.provisionalRequests)} permintaan. Kedua hitungan dapat tumpang tindih.</p>
        <div className="overview-analytics">
          <Activity activity={data.activity || []}>
            <section className="overview-token-summary" aria-labelledby="composition-heading"><div className="overview-panel-head"><div><h2 id="composition-heading">Token input dan output tercatat</h2><p>Hanya nilai yang diketahui dari permintaan selesai, 30 hari terakhir. Usage sementara tidak dijumlahkan.</p></div><span className="overview-icon overview-mint"><Icon name="tokens" /></span></div><div className="overview-token-total"><strong>{number(data.usage.totalTokens)}</strong><span>total token tercatat — bukan estimasi usage yang hilang</span></div><div className="overview-token-bar" aria-hidden="true">{compositionTotal > 0 && <><span style={{ width: `${data.usage.promptTokens / compositionTotal * 100}%` }} /><span style={{ width: `${data.usage.completionTokens / compositionTotal * 100}%` }} /></>}</div><dl className="overview-token-legend"><div><dt><i className="overview-input-dot" />Input tercatat</dt><dd>{number(data.usage.promptTokens)}</dd></div><div><dt><i className="overview-output-dot" />Output tercatat</dt><dd>{number(data.usage.completionTokens)}</dd></div><div><dt>Sisa token berkuota</dt><dd>{number(data.keys.remainingTokens)}</dd></div></dl></section>
          </Activity>
        </div>
        {data.note && <details className="overview-data"><summary>Informasi penggunaan</summary><p>{data.note}</p></details>}
        {!data.keys.total && <section className="overview-onboarding"><div><h2>Mulai menggunakan API</h2><p>Pilih paket untuk mendapatkan kunci API.</p></div><Link className="dash-button dash-button-primary" href="/buy">Pilih paket</Link></section>}
      </>}
      <section className="overview-quick" aria-labelledby="quick-heading"><h2 id="quick-heading">Akses cepat</h2><div className="overview-quick-grid"><Link href="/account/keys" className="overview-quick-keys"><span className="overview-icon overview-yellow"><Icon name="keys" /></span><div><h3>Kelola kunci API</h3><p>Lihat kuota, ubah nama, atau cabut kunci API.</p></div><span className="overview-link-action">Buka kunci <span aria-hidden="true">↗</span></span></Link><Link href="/playground" className="overview-quick-play"><span className="overview-icon overview-mint"><Icon name="play" /></span><div><h3>Pengujian model</h3><p>Kirim permintaan ke model pilihan Anda.</p></div><span className="overview-link-action">Buka pengujian <span aria-hidden="true">↗</span></span></Link><Link href="/account/billing" className="overview-quick-billing"><span className="overview-icon overview-purple"><Icon name="wallet" /></span><div><h3>Isi saldo</h3><p>Kelola saldo dan pembayaran.</p></div><span className="overview-link-action">Buka tagihan <span aria-hidden="true">↗</span></span></Link></div></section>
      <section className="overview-tools" aria-labelledby="tools-heading"><h2 id="tools-heading">Alat akun</h2><div>{tools.filter(([href]) => !['/account/keys', '/playground', '/account/billing'].includes(href)).map(([href, title]) => <Link href={href} key={href}><h3><Icon name={href} /><span className="overview-tool-label">{title}</span><span aria-hidden="true">↗</span></h3></Link>)}</div></section>
      </div>
      <aside className="overview-sidebar" aria-label="Kabar AXIOM"><FeaturedUpdates /></aside>
    </div>
  </DashboardShell>;
}
