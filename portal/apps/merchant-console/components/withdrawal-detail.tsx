'use client';
import { useEffect, useState } from 'react';
import { api, useResource, date, money } from '../lib/api';
import type { Withdrawal, Audit } from '../lib/types';
import { Heading, Failure, CircleLoading, Status, Submit } from './ui';
export default function WithdrawalDetail({ id, admin = false }: { id: string; admin?: boolean }) {
  const base = admin ? '/api/admin/withdrawals' : '/api/withdrawals';
  const r = useResource<{ withdrawal: Withdrawal; events: Audit[] }>(`${base}/${id}`);
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('PROCESSING');
  useEffect(() => {
    setTarget(r.data?.withdrawal.status === 'PROCESSING' ? 'PAID' : 'PROCESSING');
  }, [r.data?.withdrawal.status]);
  if (r.error) return <Failure error={r.error} retry={r.refresh} />;
  if (r.loading || !r.data) return <CircleLoading />;
  const w = r.data.withdrawal;
  const terminal = ['PAID', 'REJECTED'].includes(w.status);
  return (
    <>
      <Heading title="Detail penarikan" description={w.id} action={<Status value={w.status} />} />
      {error && <Failure error={error} />}
      <div className="split equal">
        <section className="panel">
          <div className="panel-head">
            <h2>Rekening dan nominal</h2>
          </div>
          <div className="panel-body stack">
            <p className="money-large">{money(w.amount)}</p>
            <dl className="details">
              <div>
                <dt>Bank</dt>
                <dd>{w.bank_name}</dd>
              </div>
              <div>
                <dt>Nomor rekening</dt>
                <dd>{w.account_number}</dd>
              </div>
              <div>
                <dt>Pemilik rekening</dt>
                <dd>{w.account_holder}</dd>
              </div>
              <div>
                <dt>Diajukan</dt>
                <dd>{date(w.requested_at)}</dd>
              </div>
              <div>
                <dt>Estimasi</dt>
                <dd>
                  {date(w.estimated_start_at)} sampai {date(w.estimated_end_at)}
                </dd>
              </div>
              {w.transfer_reference && (
                <div>
                  <dt>Referensi transfer</dt>
                  <dd>{w.transfer_reference}</dd>
                </div>
              )}
              {w.rejection_reason && (
                <div>
                  <dt>Alasan penolakan</dt>
                  <dd>{w.rejection_reason}</dd>
                </div>
              )}
            </dl>
            {w.status === 'PAID' && (
              <div className="actions">
                <a className="button" href={`/api/receipts/withdrawal/${encodeURIComponent(w.id)}.png`} target="_blank" rel="noopener noreferrer">Lihat bukti PNG</a>
                <a className="button primary" href={`/api/receipts/withdrawal/${encodeURIComponent(w.id)}.png?download=1`} download>Unduh bukti PNG</a>
              </div>
            )}
            <p className="hint">
              Penarikan manual. Estimasi bukan jaminan pencairan; screenshot atau klik tombol tidak
              membuktikan transfer.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Riwayat status</h2>
          </div>
          <div className="panel-body">
            <ol className="timeline">
              {r.data.events.map((e) => (
                <li key={e.id}>
                  <Status value={e.to_status} />
                  <small>{date(e.created_at)}</small>
                  {e.rejection_reason && <p>{e.rejection_reason}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
      {admin && !terminal && (
        <section className="panel form-panel">
          <div className="panel-head">
            <h2>Perbarui status</h2>
          </div>
          <form
            method="post"
            className="panel-body stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              const f = new FormData(e.currentTarget);
              const payload: Record<string, unknown> = {
                status: target,
                password: f.get('password'),
                channel:
                  new URLSearchParams(window.location.search).get('channel') === 'telegram'
                    ? 'telegram_web'
                    : 'web',
              };
              if (target === 'PAID') {
                payload.transfer_reference = f.get('transfer_reference');
                payload.confirm_transferred = f.get('confirm_transferred') === 'on';
              }
              if (target === 'REJECTED') payload.rejection_reason = f.get('rejection_reason');
              try {
                await api(`${base}/${id}/status`, {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                r.refresh();
              } catch (e) {
                setError(e as Error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Status tujuan
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="PROCESSING" disabled={w.status !== 'REQUESTED'}>
                  Diproses
                </option>
                <option value="PAID" disabled={w.status !== 'PROCESSING'}>
                  Selesai
                </option>
                <option value="REJECTED">Ditolak</option>
              </select>
            </label>
            {target === 'PAID' && (
              <>
                <label>
                  Referensi transfer nyata
                  <input name="transfer_reference" minLength={5} maxLength={120} required />
                </label>
                <label className="checkbox">
                  <input name="confirm_transferred" type="checkbox" required />
                  Saya memastikan transfer telah benar-benar berhasil.
                </label>
              </>
            )}
            {target === 'REJECTED' && (
              <label>
                Alasan penolakan
                <textarea name="rejection_reason" minLength={5} maxLength={500} required />
              </label>
            )}
            <label>
              Kata sandi admin untuk verifikasi
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <Submit busy={busy}>Simpan status</Submit>
          </form>
        </section>
      )}
    </>
  );
}
