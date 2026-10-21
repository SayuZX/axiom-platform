'use client';
import { use, useRef, useState } from 'react';
import { api, useResource, date } from '../../../../lib/api';
import type { Customer, Wallet, Payment, Withdrawal } from '../../../../lib/types';
import { Heading, Failure, CircleLoading, Stat, Submit } from '../../../../components/ui';
import Link from 'next/link';
export default function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useResource<{
    customer: Customer & {
      wallet: Wallet;
      max_active_api_keys: number;
      active_api_keys: number;
      bank_account?: {
        bank_name: string;
        account_number: string;
        account_holder: string;
        status: string;
        revision: string;
      };
    };
  }>(`/api/admin/customers/${id}`);
  const invoices = useResource<{ payments: Payment[] }>(
    `/api/admin/payments?customer_id=${id}&limit=20`,
  );
  const withdrawals = useResource<{ withdrawals: Withdrawal[] }>(
    `/api/admin/withdrawals?customer_id=${id}&limit=20`,
  );
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const limitPending = useRef(false);
  const [limitBusy, setLimitBusy] = useState(false);
  const [limitMessage, setLimitMessage] = useState('');
  if (r.error) return <Failure error={r.error} retry={r.refresh} />;
  if (r.loading || !r.data) return <CircleLoading />;
  const c = r.data.customer;
  return (
    <>
      <Heading title={c.username} description={c.email} />
      {error && <Failure error={error} />}
      <div className="stats">
        <Stat label="Saldo tersedia" value={c.wallet.available_amount} highlight />
        <Stat label="Dicadangkan" value={c.wallet.reserved_amount} />
        <Stat label="Sudah ditransfer" value={c.wallet.paid_out_amount} />
      </div>
      <section className="panel">
        <div className="panel-body">
          <dl className="details">
            <div>
              <dt>ID</dt>
              <dd>{c.id}</dd>
            </div>
            <div>
              <dt>Bergabung</dt>
              <dd>{date(c.created_at)}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{c.role}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="panel form-panel">
        <form className="panel-body stack" onSubmit={async e => {
          e.preventDefault();
          if (limitPending.current) return;
          const form = e.currentTarget;
          const values = new FormData(form);
          const raw = String(values.get('max_active_api_keys') ?? '');
          if (!/^\d+$/.test(raw) || Number(raw) > 100) { setError(new Error('Batas kunci aktif harus bilangan bulat 0–100.')); return; }
          limitPending.current = true; setLimitBusy(true); setError(undefined); setLimitMessage('');
          try {
            await api(`/api/admin/customers/${id}/api-key-limit`, { method: 'POST', body: JSON.stringify({ max_active_api_keys: Number(raw), password: values.get('password') }) });
            setLimitMessage('Batas kunci API disimpan.'); r.refresh();
          } catch (err) { setError(err as Error); }
          finally { const password = form.elements.namedItem('password'); if (password instanceof HTMLInputElement) password.value = ''; limitPending.current = false; setLimitBusy(false); }
        }}>
          <h2>Batas kunci API</h2>
          <p className="hint">{c.active_api_keys} kunci aktif. Nilai 0 menonaktifkan pembuatan; menurunkan batas tidak mencabut kunci yang sudah ada. Kunci dicabut tidak dihitung.</p>
          <label>Maksimal kunci aktif<input key={c.max_active_api_keys} name="max_active_api_keys" type="number" min={0} max={100} step={1} required defaultValue={c.max_active_api_keys} disabled={limitBusy} /></label>
          <label>Kata sandi admin<input name="password" type="password" autoComplete="current-password" required disabled={limitBusy} /></label>
          <Submit busy={limitBusy}>Simpan batas kunci</Submit>
          {limitMessage && <p role="status">{limitMessage}</p>}
        </form>
      </section>
      {c.bank_account && (
        <section className="panel form-panel">
          <form
            method="post"
            className="panel-body stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(`/api/admin/customers/${id}/bank-account/verify`, {
                  method: 'POST',
                  body: JSON.stringify({
                    password: new FormData(e.currentTarget).get('password'),
                    revision: c.bank_account?.revision,
                  }),
                });
                r.refresh();
              } catch (e) {
                setError(e as Error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Verifikasi rekening</h2>
            <p>
              {c.bank_account.bank_name} — {c.bank_account.account_number} —{' '}
              {c.bank_account.account_holder}
            </p>
            <p>Status: {c.bank_account.status}</p>
            {c.bank_account.status !== 'VERIFIED' && (
              <>
                <label className="checkbox">
                  <input type="checkbox" required />
                  Saya telah memeriksa kecocokan pemilik dan rekening secara sah.
                </label>
                <label>
                  Kata sandi admin
                  <input name="password" type="password" required autoComplete="current-password" />
                </label>
                <Submit busy={busy}>Catat rekening terverifikasi</Submit>
              </>
            )}
          </form>
        </section>
      )}
      <div className="split equal">
        <section className="panel">
          <div className="panel-head">
            <h2>Transaksi terbaru</h2>
          </div>
          <div className="panel-body stack">
            {invoices.data?.payments.map((p) => (
              <Link key={p.qris_id} href={`/qr/${p.qris_id}`}>
                {p.trx_id} · {p.status}
              </Link>
            ))}
            <Link href={`/admin/transaksi?search=${encodeURIComponent(c.username)}`}>
              Lihat seluruh transaksi
            </Link>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Penarikan terbaru</h2>
          </div>
          <div className="panel-body stack">
            {withdrawals.data?.withdrawals.map((w) => (
              <Link key={w.id} href={`/admin/penarikan/${w.id}`}>
                {w.id} · {w.status}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
