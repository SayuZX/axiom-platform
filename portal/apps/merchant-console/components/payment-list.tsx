'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useResource, date, money } from '../lib/api';
import type { Payment } from '../lib/types';
import { Heading, CircleLoading, Failure, Status, Pagination, Empty } from './ui';
import styles from './payment-list.module.css';
export default function PaymentList({
  admin = false,
  customerId,
}: {
  admin?: boolean;
  customerId?: string;
}) {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const syncFilters = () => {
      const q = new URLSearchParams(window.location.search);
      setStatus(q.get('status') || 'all');
      setSearch(q.get('search') || '');
      setOffset(Math.max(0, Number(q.get('offset')) || 0));
    };
    syncFilters();
    window.addEventListener('popstate', syncFilters);
    return () => window.removeEventListener('popstate', syncFilters);
  }, []);
  const query = new URLSearchParams({
    status,
    search,
    offset: String(offset),
    limit: '20',
    ...(customerId ? { customer_id: customerId } : {}),
  });
  const { data, error, loading, refresh } = useResource<{ payments: Payment[]; total: number }>(
    `${admin ? '/api/admin/payments' : '/api/payments'}?${query}`,
  );
  const update = (next: { status?: string; search?: string; offset?: number }) => {
    const q = {
      status: next.status ?? status,
      search: next.search ?? search,
      offset: String(next.offset ?? 0),
    };
    setStatus(q.status);
    setSearch(q.search);
    setOffset(Number(q.offset));
    window.history.pushState(null, '', '?' + new URLSearchParams(q));
  };
  return (
    <>
      <Heading
        title="Transaksi"
        description={
          admin
            ? 'Pantau tagihan seluruh pelanggan.'
            : 'Semua tagihan dan status pembayaran milik Anda.'
        }
        action={
          !admin && (
            <Link className="button primary" href="/dashboard/transaksi/baru">
              Buat pembayaran
            </Link>
          )
        }
      />
      <section className={`panel ${styles.ledger}`}>
        <div className={styles.statusFilters} role="group" aria-label="Filter status transaksi">
          {[
            ['all', 'Semua transaksi'], ['PENDING', 'Menunggu'],
            ['PAID', 'Terbayar'], ['EXPIRED', 'Kedaluwarsa'],
          ].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={status === value} onClick={() => update({ status: value })}>
              {label}
            </button>
          ))}
        </div>
        <form
          className={styles.searchBar}
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: String(new FormData(e.currentTarget).get('search') || '') });
          }}
        >
          <label className="search">
            Cari referensi{admin ? ' atau pelanggan' : ''}
            <input
              name="search"
              type="search"
              defaultValue={search}
              key={search}
              placeholder="Cari transaksi…"
            />
          </label>
          <button className="button">Cari</button>
          <button className="button subtle" type="button" onClick={refresh}>
            Perbarui
          </button>
        </form>
        {error ? (
          <Failure error={error} retry={refresh} />
        ) : loading ? (
          <CircleLoading />
        ) : !data?.payments.length ? (
          <Empty>Belum ada transaksi yang sesuai filter.</Empty>
        ) : (
          <div className={styles.results}>
          <div className={`table-wrap ${styles.desktopTable}`}>
            <table>
              <caption className="sr-only">Daftar transaksi</caption>
              <thead>
                <tr>
                  <th>Referensi / dibuat</th>
                  {admin && <th>Pelanggan</th>}
                  <th className="numeric">Bruto</th>
                  <th className="numeric">Komisi</th>
                  <th className="numeric">Neto</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.qris_id}>
                    <td>
                      <span className="reference">{p.trx_id}</span>
                      <small>{date(p.created_at)}</small>
                    </td>
                    {admin && (
                      <td>
                        {p.customer_id ? (
                          <Link href={`/admin/pelanggan/${p.customer_id}`}>
                            {p.username || p.customer_id}
                          </Link>
                        ) : (
                          'Administratif'
                        )}
                      </td>
                    )}
                    <td className="numeric">{money(p.amount)}</td>
                    <td className="numeric">{money(p.fee_amount)}</td>
                    <td className="numeric">{money(p.net_amount)}</td>
                    <td>
                      <Status value={p.status} />
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <Link href={admin ? `/qr/${p.qris_id}` : `/dashboard/transaksi/${p.qris_id}`}>Detail</Link>
                        {p.status === 'PAID' && <a href={`/api/receipts/payment/${encodeURIComponent(p.qris_id)}.png`} target="_blank" rel="noopener noreferrer">Bukti PNG</a>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={styles.mobileCards} aria-label="Daftar transaksi">
            {data.payments.map((p) => (
              <li key={p.qris_id} className={styles.transactionCard}>
                <div className={styles.cardHeading}><span className="reference">{p.trx_id}</span><Status value={p.status} /></div>
                <p className={styles.cardDate}>{date(p.created_at)}</p>
                {admin && <p className={styles.customer}>{p.customer_id ? <Link href={`/admin/pelanggan/${p.customer_id}`}>{p.username || p.customer_id}</Link> : 'Administratif'}</p>}
                <dl className={styles.amounts}>
                  <div><dt>Bruto</dt><dd>{money(p.amount)}</dd></div>
                  <div><dt>Komisi</dt><dd>{money(p.fee_amount)}</dd></div>
                  <div><dt>Neto</dt><dd>{money(p.net_amount)}</dd></div>
                </dl>
                <div className={styles.cardActions}>
                  <Link href={admin ? `/qr/${p.qris_id}` : `/dashboard/transaksi/${p.qris_id}`}>Lihat detail</Link>
                  {p.status === 'PAID' && <a href={`/api/receipts/payment/${encodeURIComponent(p.qris_id)}.png`} target="_blank" rel="noopener noreferrer">Bukti PNG</a>}
                </div>
              </li>
            ))}
          </ul>
          </div>
        )}
        <Pagination
          total={data?.total || 0}
          offset={offset}
          limit={20}
          onChange={(offset) => update({ offset })}
        />
      </section>
      <p className="hint">
        Komisi hanya diakui setelah PAID. Invoice lama tetap menggunakan snapshot komisi saat
        dibuat.
      </p>
    </>
  );
}
