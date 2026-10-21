'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useResource, date } from '../../../lib/api';
import type { Audit } from '../../../lib/types';
import { Heading, Failure, CircleLoading, Pagination, Status, Empty } from '../../../components/ui';
export default function AuditPage() {
  const [offset, setOffset] = useState(0);
  const r = useResource<{ events: Audit[]; total: number }>(
    `/api/admin/audit?offset=${offset}&limit=20`,
  );
  return (
    <>
      <Heading
        title="Audit penarikan"
        description="Riwayat perubahan yang tercatat"
      />
      <section className="panel">
        {r.error ? (
          <Failure error={r.error} retry={r.refresh} />
        ) : r.loading ? (
          <CircleLoading />
        ) : !r.data?.events.length ? (
          <Empty>Belum ada perubahan penarikan.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu WIB</th>
                  <th>Aktor</th>
                  <th>Penarikan</th>
                  <th>Status awal</th>
                  <th>Status akhir</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {r.data.events.map((e) => (
                  <tr key={e.id}>
                    <td>{date(e.created_at)}</td>
                    <td>{e.actor_username}</td>
                    <td>
                      <Link className="reference" href={`/admin/penarikan/${e.withdrawal_id}`}>
                        {e.withdrawal_id}
                      </Link>
                    </td>
                    <td>{e.from_status || 'Pengajuan baru'}</td>
                    <td>
                      <Status value={e.to_status} />
                    </td>
                    <td>{e.rejection_reason || e.transfer_reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination total={r.data?.total || 0} offset={offset} limit={20} onChange={setOffset} />
      </section>
      <Link href="/admin/operasional">Lihat audit kanal dan gangguan pengiriman</Link>
    </>
  );
}
