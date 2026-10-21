'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, money } from '../../../../lib/api';
import type { Payment } from '../../../../lib/types';
import { Heading, Failure, Submit } from '../../../../components/ui';
export default function CreatePayment() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [uncertain, setUncertain] = useState<Payment>();
  const fee = Math.floor((Number(amount) * 200) / 10000);
  return (
    <>
      <Heading title="Buat pembayaran" description="Satu invoice, satu referensi pembayaran." />
      <section className="panel form-panel">
        <div className="panel-body">
          {error && <Failure error={error} />}{' '}
          {uncertain ? (
            <div className="notice">
              <p>
                Hasil provider belum pasti. Jangan buat invoice pengganti sebelum memeriksa
                referensi ini.
              </p>
              <Link className="button primary" href={`/dashboard/transaksi/${uncertain.qris_id}`}>
                Periksa invoice
              </Link>
            </div>
          ) : (
            <form
              method="post"
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(undefined);
                const password = new FormData(e.currentTarget).get('password');
                try {
                  const r = await api<Payment>('/create-qris', {
                    method: 'POST',
                    body: JSON.stringify({ amount: Number(amount), password }),
                  });
                  router.push(`/dashboard/transaksi/${r.data.qris_id}`);
                } catch (e) {
                  setError(e as Error);
                  if (
                    e instanceof ApiError &&
                    e.data &&
                    typeof e.data === 'object' &&
                    'qris_id' in e.data
                  )
                    setUncertain(e.data as Payment);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Nominal pembayaran (Rp)
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                  min={1}
                  max={10000000}
                  step={1}
                  required
                  placeholder="100000"
                />
              </label>
              <p className="hint">
                Rp1–Rp10.000.000 dalam Rupiah bulat. Pembeli membayar nominal bruto, tanpa tambahan
                komisi di atasnya.
              </p>
              <dl className="details">
                <div>
                  <dt>Komisi platform (2%)</dt>
                  <dd>{money(fee)}</dd>
                </div>
                <div>
                  <dt>Neto setelah pembayaran</dt>
                  <dd>{money(Math.max(0, Number(amount) - fee))}</dd>
                </div>
              </dl>
              <p className="hint">
                Komisi 2% dibulatkan ke bawah ke Rupiah penuh, tanpa minimum biaya. Tarif dibekukan
                saat invoice dibuat, diakui hanya setelah pembayaran terverifikasi. Biaya provider,
                bila ada, terpisah.
              </p>
              <label>
                Kata sandi untuk konfirmasi
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <Submit busy={busy}>Buat QRIS</Submit>
              <Link href="/dashboard/transaksi">Batal</Link>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
