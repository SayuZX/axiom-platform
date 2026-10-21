'use client';
import Link from 'next/link';
import { useResource } from '../../lib/api';
import { Heading, Stat, CircleLoading, Failure } from '../../components/ui';
export default function Admin() {
  const r = useResource<{ totals: Record<string, number> }>('/api/admin/overview');
  if (r.error) return <Failure error={r.error} retry={r.refresh} />;
  if (r.loading || !r.data) return <CircleLoading />;
  const t = r.data.totals;
  return (
    <>
      <Heading
        title="Ringkasan platform"
        description="Seluruh pelanggan. Pembayaran dan penarikan manual."
        action={
          <Link className="button primary" href="/admin/penarikan">
            Tinjau penarikan
          </Link>
        }
      />
      <div className="stats">
        <Stat
          label="Komisi diakui"
          value={t.fee_amount}
          note="Snapshot invoice PAID; bukan saldo siap dicairkan"
          highlight
        />
        <Stat label="Bruto terbayar" value={t.gross_amount} />
        <Stat label="Neto pelanggan" value={t.net_amount} />
      </div>
      <div className="stats">
        <Stat
          label="Menunggu pemeriksaan"
          value={t.requested_amount}
          note={`${t.requested_count} pengajuan`}
        />
        <Stat
          label="Sedang diproses"
          value={t.processing_amount}
          note={`${t.processing_count} pengajuan`}
        />
        <Stat label="Transfer dicatat selesai" value={t.paid_out_amount} />
      </div>
      <div className="split equal">
        <section className="panel">
          <div className="panel-body stack">
            <h2>{t.customer_count} pelanggan</h2>
            <p className="hint">Identitas dan buku besar tiap pelanggan; tanpa akses kredensial.</p>
            <Link className="button" href="/admin/pelanggan">
              Lihat pelanggan
            </Link>
          </div>
        </section>
        <section className="panel">
          <div className="panel-body stack">
            <h2>{t.paid_count} transaksi terbayar</h2>
            <p className="hint">
              Status terverifikasi merchant. Komisi baru 2%, dibulatkan ke bawah ke Rupiah penuh
              tanpa minimum biaya. Riwayat lama tidak diubah.
            </p>
            <Link className="button" href="/admin/transaksi">
              Lihat transaksi
            </Link>
          </div>
        </section>
      </div>
      <p className="hint">
        Tidak ada transfer bank otomatis. PAID penarikan memerlukan transfer nyata dan referensi
        unik.
      </p>
    </>
  );
}
