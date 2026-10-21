'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ApiError, money } from '../lib/api';
export function CircleLoading({
  label = 'Memuat data…',
  inline = false,
}: {
  label?: string;
  inline?: boolean;
}) {
  return (
    <span role="status" className={inline ? 'loading inline' : 'loading'}>
      <span className="loading-ring" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
const statuses: Record<string, string> = {
  PENDING: 'Menunggu',
  PAID: 'Selesai',
  EXPIRED: 'Kedaluwarsa',
  REQUESTED: 'Diajukan',
  PROCESSING: 'Diproses',
  REJECTED: 'Ditolak',
};
export function Status({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      <span aria-hidden="true" />
      {statuses[value] || value}
    </span>
  );
}
export function Heading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Failure({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div role="alert" className="notice error">
      <strong>{error.message}</strong>
      {error instanceof ApiError && error.status === 401 ? (
        <Link href="/login">Masuk kembali</Link>
      ) : (
        retry && (
          <button type="button" className="button" onClick={retry}>
            Coba lagi
          </button>
        )
      )}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Stat({
  label,
  value,
  note,
  highlight = false,
}: {
  label: string;
  value: number;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`stat ${highlight ? 'highlight' : ''}`}>
      <span>{label}</span>
      <strong>{money(value)}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function Pagination({
  total,
  offset,
  limit,
  onChange,
}: {
  total: number;
  offset: number;
  limit: number;
  onChange: (offset: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total === 0
          ? 'Tidak ada data'
          : `${offset + 1}–${Math.min(offset + limit, total)} dari ${total}`}
      </span>
      <div>
        <button
          className="button subtle"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Sebelumnya
        </button>
        <button
          className="button subtle"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
export function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="button primary" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? <CircleLoading inline label="Memproses…" /> : children}
    </button>
  );
}
