'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AxiomBrand } from './axiom-brand';
import { confirmedPaymentAmount } from '../lib/payment-success';
import { api, ApiError, useResource, date, money } from '../lib/api';
import type { Payment, PublicPayment } from '../lib/types';
import { Heading, CircleLoading, Failure, Status } from './ui';
import { HugeiconsIcon } from '@hugeicons/react';
import { Shield01Icon, Invoice01Icon, Wallet01Icon } from '@hugeicons/core-free-icons';
export default function PaymentDetail({ id }: { id: string }) {
  const resource = useResource<{ payment: Payment }>(`/api/payments/${encodeURIComponent(id)}`);
  const [observed, setObserved] = useState<Payment>();
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState('');
  const payment = observed || resource.data?.payment;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (resource.error) return <Failure error={resource.error} retry={resource.refresh} />;
  if (resource.loading && !payment) return <CircleLoading />;
  if (!payment) return null;
  const left = Math.max(0, Math.floor((Date.parse(payment.expires_at) - now) / 1000));
  return (
    <>
      <Heading
        title="Detail transaksi"
        description="Status hanya berubah setelah verifikasi penyedia."
      />
      {error && <Failure error={error} />}
      <div className="split equal">
        <section className="panel">
          <div className="qr-box">
            <p className="hint">Nominal yang dibayar</p>
            <p className="money-large">{money(payment.amount)}</p>
            <Status value={payment.status} />
            {payment.status === 'PENDING' && left > 0 ? (
              <img
                src={`/api/qr-image/${payment.qris_id}`}
                width={280}
                height={280}
                alt={`QRIS pembayaran ${money(payment.amount)}`}
              />
            ) : (
              <p className="empty">
                {payment.status === 'PAID'
                  ? 'Pembayaran telah dikonfirmasi.'
                  : 'QRIS tidak lagi aktif.'}
              </p>
            )}
            <p className="hint">
              {payment.status === 'PENDING'
                ? `Sisa waktu ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
                : 'Status tercatat oleh server'}
            </p>
            <button
              className="button primary"
              style={{ marginTop: 20 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  const r = await api<Payment>(`/check-payment?qris_id=${encodeURIComponent(id)}`);
                  setObserved(r.data);
                } catch (e) {
                  setError(e as Error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <CircleLoading inline label="Memeriksa…" /> : 'Periksa status'}
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Rincian pembayaran</h2>
          </div>
          <div className="panel-body stack">
            <dl className="details">
              <div>
                <dt>Referensi</dt>
                <dd>{payment.trx_id}</dd>
              </div>
              <div>
                <dt>Dibuat</dt>
                <dd>{date(payment.created_at)}</dd>
              </div>
              <div>
                <dt>Berlaku sampai</dt>
                <dd>{date(payment.expires_at)}</dd>
              </div>
              <div>
                <dt>Komisi platform</dt>
                <dd>{money(payment.fee_amount)}</dd>
              </div>
              <div>
                <dt>Neto pelanggan</dt>
                <dd>{money(payment.net_amount)}</dd>
              </div>
            </dl>
            <p className="hint">
              Komisi dipotong dari bruto, tidak menambah nominal pembeli. Invoice lama
              mempertahankan tarif saat dibuat. Gangguan provider bukan konfirmasi pembayaran gagal.
            </p>
            {payment.status === 'PAID' && (
              <div className="actions">
                <a className="button" href={`/api/receipts/payment/${encodeURIComponent(payment.qris_id)}.png`} target="_blank" rel="noopener noreferrer">Lihat bukti PNG</a>
                <a className="button primary" href={`/api/receipts/payment/${encodeURIComponent(payment.qris_id)}.png?download=1`} download>Unduh bukti PNG</a>
              </div>
            )}
            <label>
              Tautan checkout
              <input readOnly value={payment.qr_url} />
            </label>
            <div className="actions">
              <button
                className="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(payment.qr_url);
                    setCopied('Tautan disalin.');
                  } catch {
                    setCopied('Salin tautan dari kolom di atas.');
                  }
                }}
              >
                Salin tautan
              </button>
              <Link
                className="button"
                href={payment.qr_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Buka checkout
              </Link>
            </div>
            <p role="status" className="hint">
              {copied}
            </p>
          </div>
        </section>
      </div>
      <p className="hint">
        <Link href="/fee-policy">Kebijakan biaya</Link> ·{' '}
        <Link href="/refund-policy">Pembayaran bermasalah</Link> ·{' '}
        <Link href="/privacy-policy">Privasi</Link>
      </p>
    </>
  );
}

export function PublicCheckout({ id }: { id: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const endpoint = `/api/qr-status/${encodeURIComponent(id)}`;
  const [observed, setObserved] = useState<PublicPayment>();
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const checking = useRef<AbortController | undefined>(undefined);
  const [automatic, setAutomatic] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [checkedAt, setCheckedAt] = useState<string>();
  const [copyNotice, setCopyNotice] = useState('');
  const payment = observed;
  const check = useCallback(async () => {
    if (checking.current) return;
    const controller = new AbortController();
    checking.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api<PublicPayment>(endpoint, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]),
      });
      if (controller.signal.aborted) return;
      setObserved(response.data);
      if (confirmedPaymentAmount(response, id) !== null) setConfirmed(true);
      setCheckedAt(new Date().toISOString());
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.data && typeof cause.data === 'object') {
        const snapshot = cause.data as Partial<PublicPayment>;
        if (
          snapshot.qris_id === id &&
          typeof snapshot.trx_id === 'string' &&
          typeof snapshot.amount === 'number' &&
          Number.isSafeInteger(snapshot.amount) &&
          snapshot.amount > 0 &&
          ['PENDING', 'PAID', 'EXPIRED'].includes(snapshot.status || '') &&
          typeof snapshot.expires_at === 'string' &&
          Number.isFinite(Date.parse(snapshot.expires_at))
        ) {
          setObserved({
            qris_id: id,
            trx_id: snapshot.trx_id,
            amount: snapshot.amount,
            status: snapshot.status!,
            expires_at: snapshot.expires_at,
          });
        }
      }
      setError(
        cause instanceof Error && cause.name === 'TimeoutError'
          ? new Error('Pemeriksaan melewati batas waktu. Silakan periksa kembali.')
          : (cause as Error),
      );
    } finally {
      if (checking.current === controller) {
        checking.current = undefined;
        setBusy(false);
      }
    }
  }, [endpoint, id]);
  useEffect(() => {
    setObserved(undefined);
    setConfirmed(false);
    void check();
    return () => {
      checking.current?.abort();
      checking.current = undefined;
    };
  }, [check]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!automatic || payment?.status !== 'PENDING') return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, 8000);
    return () => clearInterval(timer);
  }, [automatic, payment?.status, check]);
  useEffect(() => {
    if (confirmed) router.replace(`/qr/${encodeURIComponent(id)}/success`);
  }, [confirmed, id, router]);
  if (confirmed) return <CircleLoading label="Pembayaran dikonfirmasi. Membuka halaman berhasil…" />;
  if (error && !payment) return <Failure error={error} retry={check} />;
  if (!payment) return <CircleLoading label="Memuat rincian pembayaran…" />;
  const left = Math.max(0, Math.floor((Date.parse(payment.expires_at) - now) / 1000));
  const active = payment.status === 'PENDING' && left > 0;
  return (
    <>
      <header className="checkout-header">
        <AxiomBrand />
        <span className="checkout-method"><HugeiconsIcon icon={Shield01Icon} size={18} aria-hidden="true" /> Pembayaran QRIS</span>
      </header>
      <div className="checkout-grid">
        <section className="checkout-payment" aria-labelledby="checkout-title">
          <p className="checkout-caption">Total pembayaran</p>
          <h1 id="checkout-title" className="checkout-amount">{money(payment.amount)}</h1>
          <div className="checkout-status" role="status"><Status value={payment.status} /></div>
          {active ? <>
            <div className="checkout-qr-frame"><img className="checkout-qr" src={`/api/qr-image/${encodeURIComponent(payment.qris_id)}`} width={280} height={280} alt={`QRIS pembayaran ${money(payment.amount)}`} /></div>
            <p className="checkout-countdown">Selesaikan dalam <strong>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</strong></p>
            <a className="button checkout-download" href={`/api/qr-image/${encodeURIComponent(payment.qris_id)}`} download="axiom-qris.png"><HugeiconsIcon icon={Wallet01Icon} size={18} aria-hidden="true" /> Simpan QRIS</a>
          </> : <div className="checkout-result">
            <HugeiconsIcon icon={Invoice01Icon} size={48} aria-hidden="true" />
            <h2>{payment.status === 'PAID' ? 'Periksa konfirmasi pembayaran' : 'QRIS tidak lagi aktif'}</h2>
            <p>{payment.status === 'PAID' ? 'Periksa status kembali untuk membuka halaman konfirmasi pembayaran.' : 'Jika sudah membayar, periksa status. Jika belum, minta tautan baru kepada penjual.'}</p>
          </div>}
          <p className="checkout-note">Bayar melalui bank atau e-wallet yang mendukung QRIS.</p>
        </section>
        <aside className="checkout-sidebar">
          <section className="checkout-info">
            <h2><HugeiconsIcon icon={Invoice01Icon} size={20} aria-hidden="true" /> Rincian pembayaran</h2>
            <dl className="checkout-details">
              <div><dt>Referensi</dt><dd>{payment.trx_id}<button type="button" className="checkout-copy" onClick={async () => { try { await navigator.clipboard.writeText(payment.trx_id); setCopyNotice('Referensi disalin.'); } catch { setCopyNotice('Tidak dapat menyalin otomatis. Pilih referensi untuk menyalin manual.'); } }}>Salin referensi</button></dd></div>
              <div><dt>Berlaku sampai</dt><dd>{date(payment.expires_at)} WIB</dd></div>
              <div><dt>Metode</dt><dd>QRIS</dd></div>
            </dl>
            <p role="status" className="checkout-note">{copyNotice}</p>
            <button className="button primary" type="button" disabled={busy} onClick={check}>{busy ? <CircleLoading inline label="Memeriksa…" /> : 'Periksa status pembayaran'}</button>
            {payment.status === 'PENDING' && <label className="checkout-auto"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /><span>Periksa otomatis setiap 8 detik</span></label>}
            <p className="checkout-note" role="status">{checkedAt ? `Terakhir diperiksa ${date(checkedAt)} WIB` : ''}</p>
            {error && <div className="checkout-error"><strong>Status belum dapat diperbarui</strong><Failure error={error} retry={busy ? undefined : check} /></div>}
          </section>
          <details className="checkout-help"><summary>Cara membayar</summary><ol><li>Buka menu QRIS pada aplikasi bank atau e-wallet.</li><li>Pindai QR di halaman ini, atau simpan lalu pilih gambar dari galeri aplikasi.</li><li>Cocokkan nominal dan penerima pada aplikasi sebelum menyetujui pembayaran.</li><li>Kembali ke halaman ini untuk memeriksa konfirmasi.</li></ol></details>
          <details className="checkout-help"><summary>Sudah membayar, status belum berubah?</summary><p>Jangan membayar ulang. Simpan bukti dan hubungi penjual. Gangguan penyedia bukan berarti pembayaran gagal.</p></details>
        </aside>
      </div>
      <footer className="checkout-footer"><HugeiconsIcon icon={Shield01Icon} size={17} aria-hidden="true" /><span>Halaman ini tidak meminta PIN, kata sandi bank, atau kunci API.</span></footer>
    </>
  );
}
