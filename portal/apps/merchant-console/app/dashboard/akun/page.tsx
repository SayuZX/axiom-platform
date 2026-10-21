'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useUser } from '../../../components/workspace';
import { api, useResource, date } from '../../../lib/api';
import { Heading, Failure, Submit } from '../../../components/ui';
export default function Account() {
  const user = useUser();
  const bank = useResource<{
    account: {
      bank_name: string;
      account_number: string;
      account_holder: string;
      status: string;
    } | null;
  }>('/api/bank-account');
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Heading title="Akun" description="Identitas, keamanan, dan rekening penarikan." />
      <div className="split equal">
        <section className="panel">
          <div className="panel-head">
            <h2>Identitas akun</h2>
          </div>
          <div className="panel-body stack">
            <dl className="details">
              <div>
                <dt>Nama pengguna</dt>
                <dd>{user.username}</dd>
              </div>
              <div>
                <dt>Email terverifikasi</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Bergabung</dt>
                <dd>{date(user.created_at)}</dd>
              </div>
            </dl>
            <Link className="button" href="/dashboard/telegram">
              Hubungkan Axiom Assistant
            </Link>
            <p className="hint">Jangan bagikan password, OTP, atau API secret melalui chat.</p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Rekening untuk Telegram</h2>
          </div>
          <div className="panel-body stack">
            {bank.data?.account && (
              <div className="notice">
                {bank.data.account.bank_name} ••••{bank.data.account.account_number.slice(-4)} —{' '}
                {bank.data.account.status === 'VERIFIED'
                  ? 'Terverifikasi'
                  : 'Menunggu pemeriksaan admin'}
              </div>
            )}
            {error && <Failure error={error} />}
            <form
              method="post"
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(undefined);
                const form = e.currentTarget;
                const f = new FormData(form);
                try {
                  await api('/api/bank-account', {
                    method: 'POST',
                    body: JSON.stringify(Object.fromEntries(f)),
                  });
                  form.reset();
                  bank.refresh();
                } catch (e) {
                  setError(e as Error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Bank
                <input name="bank_name" minLength={2} maxLength={80} required />
              </label>
              <label>
                Nomor rekening
                <input name="account_number" inputMode="numeric" pattern="[0-9]{6,34}" required />
              </label>
              <label>
                Nama pemilik
                <input name="account_holder" minLength={2} maxLength={120} required />
              </label>
              <label>
                Kata sandi akun
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <Submit busy={busy}>Ajukan pemeriksaan rekening</Submit>
              <p className="hint">
                Perubahan rekening menonaktifkan verifikasi lama. Bot hanya menggunakan rekening
                yang telah diperiksa admin.
              </p>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
