'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useResource, money } from '../../../../lib/api';
import { Heading, Failure, CircleLoading, Submit } from '../../../../components/ui';
export default function ConfirmAction({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const r = useResource<{
    action: {
      kind: string;
      state: string;
      resource_id: string | null;
      payload: {
        amount?: number;
        bank_name?: string;
        account_number?: string;
        account_holder?: string;
        status?: string;
        id?: string;
        transfer_reference?: string;
        rejection_reason?: string;
      };
    };
  }>(`/api/actions/${id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  if (r.error) return <Failure error={r.error} retry={r.refresh} />;
  if (r.loading || !r.data) return <CircleLoading />;
  const a = r.data.action;
  const fee = Math.floor(((a.payload.amount || 0) * 200) / 10000);
  return (
    <>
      <Heading
        title="Konfirmasi aman"
        description="Draf dari Telegram. Kata sandi hanya dimasukkan pada halaman ini."
      />
      <section className="panel form-panel">
        <form
          method="post"
          className="panel-body stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            const password = new FormData(e.currentTarget).get('password');
            try {
              const result = await api<{ kind: string; resource_id: string }>(
                `/api/actions/${id}/confirm`,
                { method: 'POST', body: JSON.stringify({ password }) },
              );
              router.replace(
                `${a.kind === 'withdrawal_status' ? '/admin' : '/dashboard'}/${result.data.kind === 'payment' ? 'transaksi' : 'penarikan'}/${result.data.resource_id}`,
              );
            } catch (e) {
              setError(e as Error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <Failure error={error} />}
          <dl className="details">
            <div>
              <dt>Tindakan</dt>
              <dd>
                {a.kind === 'payment'
                  ? 'Buat invoice'
                  : a.kind === 'withdrawal_status'
                    ? 'Ubah status penarikan'
                    : 'Ajukan penarikan'}
              </dd>
            </div>
            {a.payload.amount !== undefined && (
              <div>
                <dt>Nominal</dt>
                <dd>{money(a.payload.amount)}</dd>
              </div>
            )}
            {a.kind === 'payment' ? (
              <>
                <div>
                  <dt>Komisi (2%, dibulatkan ke bawah)</dt>
                  <dd>{money(fee)}</dd>
                </div>
                <div>
                  <dt>Neto</dt>
                  <dd>{money((a.payload.amount || 0) - fee)}</dd>
                </div>
              </>
            ) : a.kind === 'withdrawal_status' ? (
              <>
                <div>
                  <dt>Penarikan</dt>
                  <dd>{a.payload.id}</dd>
                </div>
                <div>
                  <dt>Status tujuan</dt>
                  <dd>{a.payload.status}</dd>
                </div>
                {a.payload.transfer_reference && (
                  <div>
                    <dt>Bukti referensi transfer</dt>
                    <dd>{a.payload.transfer_reference}</dd>
                  </div>
                )}
                {a.payload.rejection_reason && (
                  <div>
                    <dt>Alasan penolakan</dt>
                    <dd>{a.payload.rejection_reason}</dd>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <dt>Rekening</dt>
                  <dd>
                    {a.payload.bank_name} {a.payload.account_number}
                  </dd>
                </div>
                <div>
                  <dt>Pemilik</dt>
                  <dd>{a.payload.account_holder}</dd>
                </div>
              </>
            )}
          </dl>
          <label className="checkbox">
            <input type="checkbox" required />
            {a.payload.status === 'PAID'
              ? 'Saya memastikan transfer nyata berhasil dan referensi benar. Saya mengotorisasi pencatatan PAID.'
              : 'Rincian benar; saya mengotorisasi tindakan ini.'}
          </label>
          <label>
            Kata sandi akun
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <Submit busy={busy}>Konfirmasi tindakan</Submit>
          <p className="hint">
            Pengulangan konfirmasi memakai tindakan yang sama, tidak membuat perubahan keuangan
            baru.
          </p>
        </form>
      </section>
    </>
  );
}
