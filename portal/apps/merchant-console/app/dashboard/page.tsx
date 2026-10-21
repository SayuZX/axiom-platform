'use client';
import Link from 'next/link';
import { useResource, money } from '../../lib/api';
import type { Overview } from '../../lib/types';
import { Heading, CircleLoading, Failure, Status } from '../../components/ui';
import { ChangelogPanel } from '../../components/changelog';
import styles from '../overview.module.css';
export default function Dashboard() {
  const { data, error, loading, refresh } = useResource<Overview>('/api/overview');
  if (error) return <Failure error={error} retry={refresh} />;
  if (loading || !data) return <CircleLoading />;
  const max = Math.max(1, ...data.charts.daily.map((d) => d.net_amount));
  return (
    <div className={styles.dashboard}>
      <Heading
        title="Ringkasan"
        description={`Selamat datang, ${data.user.username}. Berikut aktivitas pembayaran Anda.`}
      />
      <div className={styles.dashboardColumns}>
      <div className={styles.dashboardMain}>
      <section className={styles.balance} aria-labelledby="available-balance">
        <div className={styles.balanceMain}>
          <h2 id="available-balance">Tersedia untuk ditarik</h2>
          <p className={styles.balanceAmount}>{money(data.wallet.available_amount)}</p>
          <p className="hint">Neto terbayar dikurangi reservasi dan penarikan selesai.</p>
          <Link className="button primary" href="/dashboard/penarikan">Tarik dana</Link>
        </div>
        <div className={styles.balanceActions}>
          <div>
            <h2>Terima pembayaran</h2>
            <p>Buat tagihan baru, lalu bagikan tautan pembayaran kepada pelanggan.</p>
          </div>
          <Link className="button" href="/dashboard/transaksi/baru">Buat pembayaran</Link>
          <Link href="/dashboard/transaksi">Lihat seluruh transaksi</Link>
        </div>
      </section>
      <dl className={styles.moneySummary} aria-label="Ringkasan dana seluruh waktu">
        <div><dt>Pendapatan neto</dt><dd>{money(data.totals.paid_net_amount)}<p>Seluruh pembayaran terkonfirmasi</p></dd></div>
        <div><dt>Dana dicadangkan</dt><dd>{money(data.wallet.reserved_amount)}<p>Pengajuan menunggu dan sedang diproses</p></dd></div>
        <div><dt>Sudah ditransfer</dt><dd>{money(data.wallet.paid_out_amount)}<p>Penarikan yang telah selesai</p></dd></div>
      </dl>
      <div className={styles.activity}>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Pendapatan neto</h2>
              <p>7 hari · Tanggal invoice dibuat, WIB</p>
            </div>
            <button className="button subtle" onClick={refresh}>
              Perbarui
            </button>
          </div>
          <ol className="bars">
            {data.charts.daily.map((d) => (
              <li key={d.date}>
                <span>{d.date.slice(5)}</span>
                <div className="bar-track">
                  <span style={{ width: `${(d.net_amount / max) * 100}%` }} />
                </div>
                <strong>{money(d.net_amount)}</strong>
              </li>
            ))}
          </ol>
          {data.charts.daily.every((d) => !d.count) && (
            <p className="hint panel-body">
              Belum ada pembayaran untuk invoice yang dibuat pada periode ini.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Status tagihan</h2>
              <p>Seluruh waktu · {data.totals.total_count} tagihan</p>
            </div>
          </div>
          <dl className="counts">
            {data.charts.status.map((s) => (
              <div key={s.status}>
                <dt>
                  <Status value={s.status} />
                </dt>
                <dd>{s.count}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <section className={styles.reconciliation} aria-label="Rincian pembayaran">
        <dl>
          <div><dt>Bruto terbayar</dt><dd>{money(data.totals.paid_amount)}</dd></div>
          <div><dt>Komisi diakui</dt><dd>{money(data.totals.paid_fee_amount)}</dd></div>
        </dl>
        <p className="hint">Komisi mengikuti snapshot masing-masing invoice.</p>
      </section>
      <p className={styles.merchantNote}>
        <strong>Status merchant</strong>
        <span>{data.merchant.ready
          ? 'Merchant siap menerima pembayaran.'
          : 'Koneksi merchant belum dapat dipastikan.'}</span>
      </p>
      <p className="hint">
        Komisi invoice baru 2%, dibulatkan ke bawah ke Rupiah penuh tanpa minimum biaya. Riwayat
        mengikuti snapshot invoice. Neto bukan saldo rekening provider. Penarikan diproses manual,
        estimasi 1–2 hari kalender.
      </p>
      </div>
      <ChangelogPanel />
      </div>
    </div>
  );
}
