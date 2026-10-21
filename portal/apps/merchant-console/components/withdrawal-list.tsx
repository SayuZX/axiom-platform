'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useResource, date, money } from '../lib/api';
import type { Withdrawal, Wallet } from '../lib/types';
import { Heading, Stat, CircleLoading, Failure, Status, Pagination, Empty } from './ui';
export default function WithdrawalList({ admin = false }: { admin?: boolean }) {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('all');
  const rows = useResource<{ withdrawals: Withdrawal[]; total: number }>(
    `${admin ? '/api/admin/withdrawals' : '/api/withdrawals'}?limit=20&offset=${offset}&status=${status}`,
  );
  const wallet = useResource<{ wallet: Wallet }>('/api/wallet');
  return (
    <>
      <Heading
        title="Penarikan"
        description={
          admin
            ? 'Tinjau antrean. Catat hasil transfer manual.'
            : 'Ajukan saldo neto tersedia ke rekening Anda.'
        }
        action={
          !admin && (
            <Link className="button primary" href="/dashboard/penarikan/baru">
              Ajukan penarikan
            </Link>
          )
        }
      />
      {!admin && wallet.data && (
        <div className="stats">
          <Stat
            label="Tersedia untuk diajukan"
            value={wallet.data.wallet.available_amount}
            highlight
          />
          <Stat label="Dicadangkan" value={wallet.data.wallet.reserved_amount} />
          <Stat label="Sudah ditransfer" value={wallet.data.wallet.paid_out_amount} />
        </div>
      )}
      <section className="panel">
        <div className="filters">
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              {['all', 'REQUESTED', 'PROCESSING', 'PAID', 'REJECTED'].map((s) => (
                <option key={s} value={s}>
                  {
                    {
                      all: 'Semua status',
                      REQUESTED: 'Diajukan',
                      PROCESSING: 'Diproses',
                      PAID: 'Selesai',
                      REJECTED: 'Ditolak',
                    }[s]
                  }
                </option>
              ))}
            </select>
          </label>
          <button className="button" onClick={rows.refresh}>
            Perbarui
          </button>
        </div>
        {rows.error ? (
          <Failure error={rows.error} retry={rows.refresh} />
        ) : rows.loading ? (
          <CircleLoading />
        ) : !rows.data?.withdrawals.length ? (
          <Empty>Belum ada penarikan.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Referensi</th>
                  {admin && <th>Pelanggan</th>}
                  <th>Rekening tujuan</th>
                  <th className="numeric">Nominal</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.data.withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <span className="reference">{w.id}</span>
                      <small>{date(w.requested_at)}</small>
                    </td>
                    {admin && <td>{w.username}</td>}
                    <td>
                      {w.bank_name}
                      <small>••••{w.account_number.slice(-4)}</small>
                    </td>
                    <td className="numeric">{money(w.amount)}</td>
                    <td>
                      <Status value={w.status} />
                    </td>
                    <td>
                      <Link href={`${admin ? '/admin' : '/dashboard'}/penarikan/${w.id}`}>
                        Lihat
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination total={rows.data?.total || 0} offset={offset} limit={20} onChange={setOffset} />
      </section>
      <p className="hint">
        Estimasi 1–2 hari kalender sejak pengajuan, bukan jaminan selesai. Transfer dilakukan
        manual; penolakan melepaskan reservasi.
      </p>
    </>
  );
}
