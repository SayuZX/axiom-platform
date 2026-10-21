'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useResource, money } from '../../../lib/api';
import type { Customer } from '../../../lib/types';
import { Heading, Failure, CircleLoading, Empty, Pagination } from '../../../components/ui';
export default function Customers() {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const r = useResource<{ customers: Customer[]; total: number }>(
    `/api/admin/customers?search=${encodeURIComponent(search)}&limit=20&offset=${offset}`,
  );
  return (
    <>
      <Heading
        title="Pelanggan"
        description="Identitas dan saldo buku besar tanpa kredensial akun."
      />
      <section className="panel">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(String(new FormData(e.currentTarget).get('search')));
            setOffset(0);
          }}
        >
          <label className="search">
            Nama, email, atau ID
            <input name="search" type="search" />
          </label>
          <button className="button">Cari</button>
        </form>
        {r.error ? (
          <Failure error={r.error} retry={r.refresh} />
        ) : r.loading ? (
          <CircleLoading />
        ) : !r.data?.customers.length ? (
          <Empty>Tidak ada pelanggan yang sesuai.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th>Role</th>
                  <th className="numeric">Tersedia</th>
                  <th className="numeric">Dicadangkan</th>
                  <th className="numeric">Komisi</th>
                </tr>
              </thead>
              <tbody>
                {r.data.customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/pelanggan/${c.id}`}>{c.username}</Link>
                      <small>{c.email}</small>
                    </td>
                    <td>{c.role}</td>
                    <td className="numeric">{money(c.available_amount)}</td>
                    <td className="numeric">{money(c.reserved_amount)}</td>
                    <td className="numeric">{money(c.fee_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination total={r.data?.total || 0} offset={offset} limit={20} onChange={setOffset} />
      </section>
    </>
  );
}
