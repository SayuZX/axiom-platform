'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useResource, date } from '../../../lib/api';
import { Heading, CircleLoading, Failure, Empty } from '../../../components/ui';
import { policyLinks } from '../../../components/policy';
import styles from '../../overview.module.css';

type Report = {
  generated_at: string;
  email: { state: string; count: number }[];
  telegram: { state: string; count: number }[];
  updates: { state: string; count: number }[];
  pending_support: number;
  telegram_configured: boolean;
  policy_missing: string[];
  policies: { published: boolean };
  audit: {
    id: number;
    username: string | null;
    channel: string;
    action: string;
    resource_id: string | null;
    result: string;
    created_at: string;
  }[];
};

const labels: Record<string, string> = {
  web: 'Portal web', telegram: 'Telegram', email: 'Email',
  pending: 'Menunggu', sending: 'Sedang dikirim', processing: 'Sedang diproses',
  failed: 'Gagal', accepted: 'Diterima server email', sent: 'Terkirim', done: 'Selesai diproses',
  cancelled: 'Dibatalkan', deleted: 'Pesan dihapus', success: 'Berhasil', handled: 'Ditangani',
  'payment.create': 'Membuat transaksi', 'withdrawal.create': 'Mengajukan penarikan',
  'withdrawal.status': 'Mengubah status penarikan', 'action.confirm': 'Konfirmasi tindakan',
  'bank-account.verify': 'Verifikasi rekening', 'support.reply': 'Membalas tiket',
  'support.internal-note': 'Menambah catatan internal', callback: 'Tombol Telegram', message: 'Pesan Telegram',
  operator_name: 'Nama pengelola', support_hours: 'Jam layanan bantuan', withdrawal_schedule: 'Jadwal penarikan',
  retention_accounts: 'Masa simpan data akun', retention_financial: 'Masa simpan data keuangan',
  retention_support: 'Masa simpan tiket', retention_logs: 'Masa simpan log', version: 'Versi kebijakan',
  effective_at: 'Tanggal berlaku', updated_at: 'Tanggal pembaruan', contact_email: 'Email kontak', privacy_email: 'Email privasi',
};
const label = (value: string) => value.startsWith('rejected:')
  ? `Ditolak (${value.slice('rejected:'.length)})`
  : labels[value] || value;
const queues = [
  { key: 'email', title: 'Pengiriman email', states: ['pending', 'sending', 'failed', 'accepted'], note: 'Diterima server email tidak memastikan pesan masuk ke kotak masuk penerima.' },
  { key: 'telegram', title: 'Pengiriman Telegram', states: ['pending', 'sending', 'failed', 'sent'], note: 'Terkirim berarti permintaan diterima Telegram, bukan pesan telah dibaca.' },
  { key: 'updates', title: 'Pesan masuk Telegram', states: ['pending', 'processing', 'failed', 'done'], note: 'Antrean pembaruan masuk yang diproses oleh bot.' },
] as const;

function auditLink(row: Report['audit'][number]) {
  if (!row.resource_id) return null;
  const id = encodeURIComponent(row.resource_id);
  if (row.action.startsWith('withdrawal.')) return `/admin/penarikan/${id}`;
  if (row.action.startsWith('support.')) return `/admin/bantuan/${id}`;
  if (row.action.startsWith('payment.')) return '/admin/transaksi';
  if (row.action === 'bank-account.verify') return `/admin/pelanggan/${id}`;
  return null;
}

export default function Operations() {
  const resource = useResource<Report>('/api/admin/operations');
  const [channel, setChannel] = useState('');
  const [result, setResult] = useState('');
  const [search, setSearch] = useState('');
  if (resource.error) return <Failure error={resource.error} retry={resource.refresh} />;
  if (resource.loading || !resource.data) return <CircleLoading />;
  const report = resource.data;
  const failed = queues.reduce((total, { key }) => total + report[key].reduce((count, row) => count + (row.state === 'failed' ? row.count : 0), 0), 0);
  const pending = queues.reduce((total, { key }) => total + report[key].reduce((count, row) => count + (row.state === 'pending' ? row.count : 0), 0), 0);
  const query = search.trim().toLocaleLowerCase('id-ID');
  const audit = report.audit.filter((row) =>
    (!channel || row.channel === channel) && (!result || row.result === result) &&
    [row.username, row.channel, label(row.channel), row.action, label(row.action), row.resource_id, row.result, label(row.result)]
      .some((value) => value?.toLocaleLowerCase('id-ID').includes(query)),
  );

  return (
    <div className={styles.operations}>
      <Heading title="Operasional" description="Antrean notifikasi, tiket bantuan, kebijakan, dan riwayat tindakan."
        action={<button className="button" onClick={resource.refresh}>Perbarui data</button>} />
      <p className="hint" role="status">Terakhir diperbarui: <time dateTime={report.generated_at}>{date(report.generated_at)}</time> WIB. Jumlah berdasarkan status tersimpan, bukan pemeriksaan kesehatan layanan.</p>
      <section className={styles.priorities} aria-labelledby="operations-priorities">
        <div className={styles.priorityIntro}>
          <h2 id="operations-priorities">Prioritas operasional</h2>
          <p>Tinjau pekerjaan yang menunggu tindak lanjut.</p>
        </div>
        <Link className={styles.priority} href="/admin/bantuan">
          <span>Tiket menunggu pengelola</span>
          <strong>{report.pending_support.toLocaleString('id-ID')}</strong>
          <span>Buka tiket bantuan</span>
        </Link>
        <a className={styles.priority} href="#antrean-operasional">
          <span>Pekerjaan berstatus gagal</span>
          <strong>{failed.toLocaleString('id-ID')}</strong>
          <span>Tinjau rincian antrean</span>
        </a>
        <a className={styles.priority} href="#antrean-operasional">
          <span>Pekerjaan menunggu</span>
          <strong>{pending.toLocaleString('id-ID')}</strong>
          <span>Lihat status per kanal</span>
        </a>
      </section>
      <nav className={styles.operationsLinks} aria-label="Tautan operasional">
        <span>Kelola</span>
        <Link href="/admin/penarikan">Penarikan</Link>
        <Link href="/admin/transaksi">Transaksi</Link>
        <Link href="/admin/audit">Audit penarikan</Link>
      </nav>
      <section id="antrean-operasional" className={styles.queues} aria-labelledby="queue-heading">
        <div className={styles.sectionTitle}><h2 id="queue-heading">Antrean per kanal</h2><p>Jumlah pekerjaan berdasarkan status tersimpan</p></div>
        <div className={styles.queueGrid}>
        {queues.map(({ key, title, states, note }) => {
          const counts = new Map(report[key].map((row) => [row.state, row.count]));
          const visibleStates = [...new Set<string>([...states, ...counts.keys()])];
          return (
            <section className={styles.queue} key={key}>
              <div className="panel-head"><h2>{title}</h2></div>
              <div className="panel-body stack">
                <dl className="details">
                  {visibleStates.map((state) => <div key={state}><dt>{label(state)}</dt><dd>{(counts.get(state) || 0).toLocaleString('id-ID')}</dd></div>)}
                </dl>
                {!report[key].length && <p className="hint">Belum ada pekerjaan tercatat.</p>}
                <p className="hint">{note}</p>
              </div>
            </section>
          );
        })}
        </div>
        <p className={styles.configuration}>Konfigurasi Telegram: {report.telegram_configured ? 'tersedia' : 'belum tersedia'}. Status konfigurasi tidak menunjukkan koneksi atau keberhasilan pengiriman.</p>
      </section>
      <details className={styles.policy} id="kebijakan-operasional">
        <summary><span>Kebijakan dan publikasi</span><span>{report.policies.published ? 'Diterbitkan' : 'Draf internal'}{report.policy_missing.length > 0 ? ` · ${report.policy_missing.length} data belum lengkap` : ''}</span></summary>
        <div className="panel-body stack">
          <p>{report.policies.published ? 'Versi kebijakan diterbitkan.' : 'Draf internal. Publikasi ditahan hingga data dan peninjauan lengkap.'}</p>
          {report.policy_missing.length > 0 && <p className="hint">Perlu dilengkapi: {report.policy_missing.map(label).join(', ')}</p>}
          {policyLinks.map(([slug, title]) => <Link key={slug} href={`/admin/kebijakan/${slug}`}>Tinjau {title}</Link>)}
        </div>
      </details>
      <section className={`panel ${styles.audit}`}>
        <div className="panel-head"><div><h2>Riwayat tindakan lintas kanal</h2><p>Filter berlaku pada maksimal 100 tindakan terbaru, bukan seluruh riwayat.</p></div><Link href="/admin/audit">Audit penarikan historis</Link></div>
        <div className={`filters ${styles.auditFilters}`}>
          <label>Kanal<select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Semua kanal</option>{[...new Set([...report.audit.map((row) => row.channel), ...(channel ? [channel] : [])])].sort().map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label>Hasil<select value={result} onChange={(event) => setResult(event.target.value)}><option value="">Semua hasil</option>{[...new Set([...report.audit.map((row) => row.result), ...(result ? [result] : [])])].sort().map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label className="search">Cari aktor, tindakan, atau referensi<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <button className="button" onClick={() => { setChannel(''); setResult(''); setSearch(''); }} disabled={!channel && !result && !search}>Hapus filter</button>
        </div>
        <p className="panel-body hint" role="status">Menampilkan {audit.length} dari {report.audit.length} tindakan terbaru.</p>
        {!audit.length ? <Empty>{report.audit.length ? 'Tidak ada tindakan yang sesuai dengan filter.' : 'Belum ada tindakan tercatat.'}</Empty> : (
          <div className="table-wrap" role="region" aria-label="Riwayat tindakan, gulir untuk melihat seluruh kolom" tabIndex={0}>
            <table>
              <thead><tr>{['Waktu (WIB)', 'Aktor', 'Kanal', 'Tindakan', 'Referensi', 'Hasil'].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
              <tbody>{audit.map((row) => {
                const href = auditLink(row);
                return <tr key={row.id}><td>{date(row.created_at)}</td><td>{row.username || 'Tidak tercatat'}</td><td>{label(row.channel)}</td><td>{label(row.action)}</td><td>{href ? <Link href={href}>{row.resource_id}</Link> : row.resource_id || '—'}</td><td>{label(row.result)}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
