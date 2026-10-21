'use client';
import { useResource, money } from '../../../lib/api';
import type { Totals } from '../../../lib/types';
import { Heading, Failure, CircleLoading, Stat } from '../../../components/ui';
export default function Commissions() {
  const r = useResource<{ totals: Totals; policies: (Totals & { fee_policy: string })[] }>(
    '/api/admin/commissions',
  );
  if (r.error) return <Failure error={r.error} retry={r.refresh} />;
  if (r.loading || !r.data) return <CircleLoading />;
  return (
    <>
      <Heading
        title="Komisi platform"
        description="Pendapatan berdasarkan invoice PAID, bukan jumlah transaksi dikali tarif terkini."
      />
      <div className="stats">
        <Stat label="Komisi diakui" value={r.data.totals.fee_amount} highlight />
        <Stat label="Bruto terbayar" value={r.data.totals.gross_amount} />
        <Stat label="Neto milik pelanggan" value={r.data.totals.net_amount} />
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kebijakan</th>
                <th>Transaksi PAID</th>
                <th className="numeric">Bruto</th>
                <th className="numeric">Komisi</th>
                <th className="numeric">Neto</th>
              </tr>
            </thead>
            <tbody>
              {r.data.policies.map((p) => (
                <tr key={p.fee_policy}>
                  <td>{p.fee_policy}</td>
                  <td>{p.paid_count}</td>
                  <td className="numeric">{money(p.gross_amount)}</td>
                  <td className="numeric">{money(p.fee_amount)}</td>
                  <td className="numeric">{money(p.net_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="hint">
        Invoice pembayaran berhasil, Pendapatan ini
        bukan jaminan dana bank siap dicairkan dan belum dikurangi biaya operasional/provider.
      </p>
    </>
  );
}
