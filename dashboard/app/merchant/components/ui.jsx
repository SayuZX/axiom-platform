'use client';
import Skeleton from '../../components/Skeleton';
import GlobalFeedback from '../../components/GlobalFeedback';

import { useEffect, useRef, useState } from 'react';
import '../merchant.css';

export const rupiah = (amount) => Number.isSafeInteger(amount) && amount >= 0 ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount) : 'Tidak tersedia';
export const dateLabel = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('id-ID') : 'Tidak tersedia';
export const checkoutStorageKey = (id) => `axiom-checkout:${id}`;

export async function request(path, { method = 'GET', body, signal, headers = {} } = {}) {
  const timeout = method === 'POST' ? 90000 : 60000;
  const deadline = AbortSignal.timeout(timeout);
  const response = await fetch(path, { method, cache: 'no-store', credentials: 'same-origin', headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.error || (response.status === 401 ? 'Sesi berakhir. Silakan masuk kembali.' : 'Layanan belum dapat dihubungi. Coba lagi.'));
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}
export const errorLabel = (error) => error.name === 'TimeoutError' ? 'Permintaan terlalu lama. Periksa status sebelum mencoba kembali.' : error.message || 'Permintaan gagal. Coba lagi.';

// A single request slot covers manual refresh, cancellation and background polling.
export function usePaymentResource({ path, headers, enabled = true, initial = null, onUnauthorized }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(null);
  const latest = useRef({ path, headers, onUnauthorized });
  latest.current = { path, headers, onUnauthorized };
  useEffect(() => {
    setData(initial); setError(''); setBusy(false);
    return () => { const active = inFlight.current; inFlight.current = null; active?.abort(); };
  }, [path, initial, enabled]);
  async function refresh(cancel = false) {
    if (!enabled || !latest.current.path || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true); setError('');
    try {
      const current = latest.current;
      const result = await request(cancel ? current.path.replace(/\/status$/, '') + '/cancel' : current.path, { headers: current.headers, signal: controller.signal, ...(cancel ? { method: 'POST', body: {} } : {}) });
      if (!controller.signal.aborted) setData(result);
      return result;
    } catch (failure) {
      if (!controller.signal.aborted) { setError(errorLabel(failure)); if (failure.status === 401) latest.current.onUnauthorized?.(failure); }
    } finally {
      if (inFlight.current === controller) { inFlight.current = null; setBusy(false); }
    }
  }
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => { if (enabled && path && !initial) void refreshRef.current(); }, [enabled, path, initial]);
  const status = data?.payment?.status ?? data?.status;
  useEffect(() => {
    if (!enabled || !['pending','unknown'].includes(status)) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshRef.current(); }, 10000);
    return () => clearInterval(timer);
  }, [enabled, status, path]);
  return { data, error, busy, refresh };
}

function Mark() {
  return <img src="/axiom-ai.svg" width="43" height="43" alt=""/>;
}
export function Shell({ children, area = 'QRIS & TOKEN', actions }) {
  return <div className="merchant-ui" lang="id"><div className="m-ribbon">ONE GATEWAY. MORE POSSIBILITIES.</div><header className="m-header"><a href="/" className="m-brand" aria-label="AXIOM AI beranda"><Mark/><span>AXIOM <b>AI</b></span></a><nav aria-label="Navigasi pembayaran"><a href="/buy">Beli token</a><a href="/docs">Dokumentasi</a><a href="/">Beranda</a>{actions}</nav></header><main className="m-main"><div className="m-eyebrow">AXIOM AI / {area}</div>{children}</main><footer className="m-footer"><a href="/" className="m-brand"><Mark/><span>AXIOM AI</span></a><p>Satu akses untuk ide yang lebih besar.</p><a href="/">Kembali ke beranda</a></footer></div>;
}
export function Alert({ children, kind = 'error' }) { return children ? <GlobalFeedback info={kind !== 'error'}>{children}</GlobalFeedback> : null; }
export function Heading({ tag, title, children }) { return <div className="m-heading">{tag && <span className="m-tag">{tag}</span>}<h1>{title}</h1>{children && <p>{children}</p>}</div>; }
const statuses = { pending: 'Menunggu pembayaran', unknown: 'Status perlu diperiksa', settlement: 'Pembayaran diterima', cancel: 'Dibatalkan', expire: 'Kedaluwarsa', deny: 'Ditolak', failure: 'Gagal' };
export function Status({ status }) { return <span className={`m-status m-status-${Object.hasOwn(statuses, status) ? status : 'unknown'}`}>{statuses[status] || 'Status belum tersedia'}</span>; }

export function BalanceValue({ balance }) {
  if (!balance) return <strong>Belum dimuat</strong>;
  if (balance.available === false) return <strong>Tidak tersedia</strong>;
  if (balance.unit !== 'unverified' && balance.currency === 'IDR' && Number.isSafeInteger(balance.amount) && balance.amount >= 0) return <strong>{rupiah(balance.amount)}</strong>;
  const values = [];
  function collect(value, label = '') {
    if (typeof value === 'number' && Number.isFinite(value)) values.push([label || 'Nilai', String(value)]);
    else if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) values.push([label || 'Nilai', value]);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) collect(child, label ? `${label}.${key}` : key);
  }
  collect(balance.provider_balance);
  return <div><strong>Satuan provider belum terverifikasi</strong><p className="m-muted">Nilai mentah berikut bukan nominal Rupiah terverifikasi.</p>{balance.message && <p className="m-muted">{balance.message}</p>}{values.length ? <dl className="m-details">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="m-muted">Nilai saldo tidak tersedia.</p>}</div>;
}

export function PaymentCard({ payment, busy, onRefresh, onCancel, error, qrPath, qrToken, onCancelRequest, ErrorComponent }) {
  const [image, setImage] = useState('');
  const [qrError, setQrError] = useState('');
  const cancelling = useRef(false);
  useEffect(() => {
    let active = true;
    let objectUrl;
    const controller = new AbortController();
    setImage(''); setQrError('');
    async function loadQr() {
      try {
        if (payment?.status !== 'pending') return;
        if (payment.qr_string) {
          const module = await import('qrcode');
          const url = await (module.default || module).toDataURL(payment.qr_string, { width: 320, margin: 4, errorCorrectionLevel: 'M' });
          if (active) setImage(url);
        } else if (payment.qr_image_url && qrPath && /^\/(?:merchant-api\/payments|commerce-api\/orders)\/[^/?#]+\/qr$/.test(qrPath)) {
          const response = await fetch(qrPath, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: qrToken ? { 'X-Checkout-Token': qrToken } : {}, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
          if (!response.ok) throw new Error('QRIS belum dapat dimuat. Periksa status pembayaran.');
          const blob = await response.blob();
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type) || blob.size > 2 * 1024 * 1024) throw new Error('Format gambar QRIS tidak didukung. Periksa status pembayaran.');
          if (active) { objectUrl = URL.createObjectURL(blob); setImage(objectUrl); }
        }
      } catch (failure) { if (active && !controller.signal.aborted) setQrError(errorLabel(failure)); }
    }
    void loadQr();
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [payment?.qr_string, payment?.qr_image_url, payment?.status, qrPath, qrToken]);
  if (!payment) return null;
  return <section className="m-card m-payment" aria-label="Detail pembayaran"><div className="m-row"><h2>Invoice QRIS</h2><Status status={payment.status}/></div><div className="m-price">{rupiah(payment.amount)}</div><p className="m-muted">Nominal tepat. Tanpa kode unik.</p><dl className="m-details"><div><dt>Nomor pesanan</dt><dd>{payment.order_id || 'Tidak tersedia'}</dd></div>{payment.transaction_id && <div><dt>ID transaksi</dt><dd>{payment.transaction_id}</dd></div>}{payment.expires_at && <div><dt>Batas pembayaran</dt><dd>{dateLabel(payment.expires_at)}</dd></div>}</dl>{payment.status === 'pending' && <><div className="m-qr">{image ? <img src={image} width="320" height="320" alt={`QRIS pembayaran ${rupiah(payment.amount)}`}/> : payment.qr_string && !qrError ? <Skeleton rows={1} variant="chart" label="Menyiapkan QRIS…" /> : <p>QRIS belum tersedia. Periksa status, jangan membuat pembayaran ganda.</p>}</div><p className="m-muted">Pindai dengan aplikasi pembayaran Anda. Pastikan nama merchant dan nominal sebelum menyetujui. Status diperiksa setiap 10 detik saat halaman terlihat.</p></>}{ErrorComponent ? <ErrorComponent message={error || qrError}/> : <Alert>{error || qrError}</Alert>}<div className="m-actions"><button className="m-button" type="button" onClick={() => onRefresh()} disabled={busy}>{busy ? 'Memeriksa…' : 'Periksa status'}</button>{payment.status === 'pending' && onCancel && <button className="m-button m-button-quiet" type="button" disabled={busy} onClick={async () => { if (onCancelRequest) return onCancelRequest(); if (cancelling.current) return; cancelling.current = true; try { if (await window.axiomConfirm({message: `Batalkan pesanan ${payment.order_id}? Invoice ${rupiah(payment.amount)} akan dibatalkan jika belum dibayar. Pembayaran yang telah diterima tidak dapat dibatalkan di sini.`})) await onCancel(); } finally { cancelling.current = false; } }}>Batalkan invoice</button>}</div></section>;
}
