'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdminRouter as useRouter } from '../components/AdminEmbed';
import { BalanceValue, PaymentCard, Status, dateLabel, errorLabel, request, rupiah, usePaymentResource } from '../merchant/components/ui';
import AdminDialog, { ErrorDialog } from './AdminDialog';

export default function MerchantTools({ configured, session }) {
  const router = useRouter();
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [invoice, setInvoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(null);
  const [cancelInvoice, setCancelInvoice] = useState(false);
  const action = useRef(null);
  const adminError = (failure) => { if (['admin_required', 'router_admin_required'].includes(failure?.code)) router.replace('/login'); };
  const payment = usePaymentResource({ path: invoice?.order_id ? `/merchant-api/payments/${encodeURIComponent(invoice.order_id)}/status` : null, initial: invoice, enabled: configured && !!invoice, onUnauthorized: adminError });

  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController(); setHistoryError(''); setHistory(null);
    request(`/merchant-api/history?page=${page}`, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setHistory(value);
    }).catch((failure) => {
      if (!controller.signal.aborted) {
        setHistoryError(errorLabel(failure));
        if (['admin_required', 'router_admin_required'].includes(failure.code)) router.replace('/login');
      }
    });
    return () => controller.abort();
  }, [configured, page, revision, router]);

  async function perform(operation) {
    if (action.current) return;
    const controller = new AbortController(); action.current = controller; setBusy(true); setError('');
    try { await operation(controller.signal); }
    catch (failure) { if (!controller.signal.aborted) { setError(errorLabel(failure)); adminError(failure); } }
    finally { if (action.current === controller) { action.current = null; if (!controller.signal.aborted) setBusy(false); } }
  }
  function generate(event) {
    event.preventDefault(); if (action.current || !configured) return;
    const amount = Number(new FormData(event.currentTarget).get('amount'));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) { const input = event.currentTarget.elements.amount; input.setCustomValidity('Masukkan nominal Rupiah bulat antara 1 dan 10.000.000.'); input.reportValidity(); return; }
    const order_id = crypto.randomUUID();
    setInvoice({ order_id, amount, status: 'unknown' });
    void perform(async (signal) => {
      try {
        const value = await request('/merchant-api/payments', { method: 'POST', body: { amount, order_id }, signal });
        if (!signal.aborted) setInvoice(value);
      } catch (failure) {
        if (!signal.aborted && failure.status >= 400 && failure.status < 500) setInvoice(null);
        throw failure;
      } finally { if (!signal.aborted) setRevision((value) => value + 1); }
    });
  }
  async function updateInvoice(cancel = false) {
    const result = await payment.refresh(cancel);
    if (result) setRevision((value) => value + 1);
  }
  const selected = payment.data || invoice;
  const activeInvoice = ['pending', 'unknown'].includes(selected?.status);
  const canBalance = session?.can_balance === true && session.role === 'admin' && !session.pending_save;

  return <div className="dash-block">
    {!configured && <p className="dash-muted">Hubungkan QRIS situs untuk menggunakan alat pembayaran.</p>}
    <ErrorDialog message={error} onClose={() => setError('')}/><ErrorDialog message={historyError}/>
    {cancelInvoice && <AdminDialog title="Batalkan invoice QRIS?" pending={payment.busy || busy} onClose={() => setCancelInvoice(false)} confirmLabel="Batalkan invoice" onConfirm={async () => { await updateInvoice(true); setCancelInvoice(false); }}><p>Pembatalan dikirim ke provider. Pembayaran yang sudah diterima tidak dikembalikan.</p></AdminDialog>}
    <div className="dash-grid">
      <section className="dash-card" aria-labelledby="merchant-generate-title"><h3 id="merchant-generate-title">Buat pembayaran QRIS</h3><p>Nominal tepat untuk penerima situs yang tersimpan, tanpa kode unik.</p>
        <form className="dash-form" onSubmit={generate}><label>Nominal (IDR)<input type="number" name="amount" min="1" step="1" max="10000000" required inputMode="numeric" onInput={event => event.currentTarget.setCustomValidity('')} disabled={!configured || busy || activeInvoice}/></label><button className="dash-button dash-button-primary" type="submit" disabled={!configured || busy || payment.busy || activeInvoice}>{busy ? 'Memproses…' : 'Buat invoice QRIS'}</button></form>
        {activeInvoice && <p className="dash-muted">Selesaikan atau batalkan invoice aktif sebelum membuat invoice baru.</p>}
        <div className="dash-block"><h3>Saldo merchant</h3><p className="dash-muted">Khusus akun admin dengan izin Wallet:Balance dari GoPay.</p>
          {canBalance ? <><BalanceValue balance={balance}/><button type="button" className="dash-button" disabled={!configured || busy} onClick={() => perform(async (signal) => { setBalance(null); const value = await request('/merchant-api/balance', { signal }); if (!signal.aborted) setBalance(value); })}>Lihat saldo</button></> : <p className="dash-muted">Izin saldo belum tersedia dari koneksi tersimpan.</p>}
        </div>
      </section>
      {selected && <PaymentCard key={selected.order_id} qrPath={`/merchant-api/payments/${encodeURIComponent(selected.order_id)}/qr`} payment={selected} busy={payment.busy || busy} onRefresh={() => updateInvoice()} onCancel={() => updateInvoice(true)} onCancelRequest={() => setCancelInvoice(true)} ErrorComponent={ErrorDialog} error={payment.error}/>}
    </div>
    <section className="dash-block" aria-labelledby="merchant-history-title"><div className="dash-row"><h3 id="merchant-history-title">Riwayat pembayaran merchant</h3><button type="button" className="dash-button" disabled={!configured} onClick={() => setRevision((value) => value + 1)}>Muat ulang riwayat</button></div>
      {configured && !history && !historyError && <p role="status">Memuat transaksi…</p>}
      {history && (history.data?.length ? <><div className="dash-table-wrap"><table className="dash-table"><caption className="dash-sr-only">Riwayat pembayaran akun situs</caption><thead><tr><th scope="col">Pesanan</th><th scope="col">Nominal</th><th scope="col">Status</th><th scope="col">Waktu</th><th scope="col">Detail</th></tr></thead><tbody>{history.data.map((item) => <tr key={item.order_id}><td>{item.order_id}</td><td>{rupiah(item.amount)}</td><td><Status status={item.status}/></td><td>{dateLabel(item.created_at)}</td><td><button type="button" className="dash-text-button" disabled={busy || payment.busy} onClick={() => setInvoice(item)}>Buka invoice</button></td></tr>)}</tbody></table></div><div className="dash-pagination"><button type="button" className="dash-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button><span>Halaman {history.pagination?.page || page} dari {history.pagination?.total_pages || 1}</span><button type="button" className="dash-button" disabled={page >= (history.pagination?.total_pages || 1)} onClick={() => setPage((value) => value + 1)}>Berikutnya</button></div></> : <p>Belum ada transaksi pada halaman ini.</p>)}
    </section>
  </div>;
}
