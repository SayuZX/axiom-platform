'use client';

import { useEffect, useRef, useState } from 'react';
import { rupiah } from '../merchant/components/ui';

const formatCount = (value) => value.toLocaleString('id-ID');
const dayLabel = (date) => new Date(`${date}T00:00:00+07:00`).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });

function AnimatedNumber({ value, money = false }) {
  const valid = Number.isFinite(value) && value >= 0;
  const [shown, setShown] = useState(value);
  const previous = useRef(0);
  useEffect(() => {
    if (!valid) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    const start = performance.now();
    const from = previous.current;
    function finish() { cancelAnimationFrame(frame); setShown(value); previous.current = value; }
    function tick(now) {
      const progress = Math.min(1, (now - start) / 650);
      const next = Math.round(from + (value - from) * (1 - (1 - progress) ** 3));
      setShown(next); previous.current = next;
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    function onPreference() { if (preference.matches) finish(); }
    if (preference.matches) finish(); else frame = requestAnimationFrame(tick);
    preference.addEventListener('change', onPreference);
    return () => { cancelAnimationFrame(frame); preference.removeEventListener('change', onPreference); };
  }, [value, valid]);
  if (!valid) return 'Tidak tersedia';
  const format = money ? rupiah : formatCount;
  return <><span aria-hidden="true">{format(Number.isFinite(shown) ? shown : value)}</span><span className="dash-sr-only">{format(value)}</span></>;
}

export function BillingSkeleton({ table = false }) {
  return <div className={`billing-skeleton ${table ? 'billing-skeleton-table' : ''}`} role="status"><span className="dash-sr-only">{table ? 'Memuat pesanan…' : 'Memuat ringkasan pembayaran…'}</span><div aria-hidden="true">{Array.from({ length: table ? 5 : 6 }, (_, index) => <span key={index}/>)}</div>{!table && <div className="billing-skeleton-chart" aria-hidden="true"/>}</div>;
}

export function BillingIcon({ cancel = false }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{cancel ? <><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8M16 8l-8 8"/></> : <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></>}</svg>;
}

export default function BillingOverview({ snapshot, loading, states, status, onStatus, busy }) {
  const [days, setDays] = useState(7);
  const [activeDay, setActiveDay] = useState(null);
  if (loading) return <BillingSkeleton/>;
  if (!snapshot) return null;
  const metrics = [['Pesanan', snapshot.orders], ['Pesanan lunas', snapshot.total_paid], ['Menunggu pembayaran', snapshot.pending], ['Penerimaan QRIS', snapshot.revenue_idr, true], ['Key diterbitkan', snapshot.issued_keys], ['Token dialokasikan', snapshot.tokens_allocated]];
  const trend = Array.isArray(snapshot.trend) ? snapshot.trend.slice(-days) : [];
  const maximum = Math.max(1, ...trend.map((item) => item.amount));
  const total = trend.reduce((sum, item) => sum + item.amount, 0);
  const statuses = Array.isArray(snapshot.statuses) ? states.map(([id, label]) => ({ status: id, label, count: snapshot.statuses.find((item) => item.status === id)?.count ?? 0 })) : [];
  const orderCount = statuses.reduce((sum, item) => sum + item.count, 0);
  const selected = trend.find((item) => item.date === activeDay);
  return <>
    <dl className="billing-metrics">{metrics.map(([label, value, money]) => <div key={label} className={`billing-metric${money ? ' billing-metric-revenue' : ''}`}><dt>{label}</dt><dd><AnimatedNumber value={value} money={money}/></dd>{money && <small>QRIS lunas · IDR</small>}</div>)}</dl>
    <p className="dash-muted billing-source">Data checkout AXIOM dan key router. Penerimaan QRIS bukan saldo merchant atau saldo pelanggan; pembelian dari saldo tidak dihitung ulang.</p>
    <div className="billing-charts">
      <section className="dash-card billing-trend" aria-labelledby="billing-trend-title">
        <div className="billing-chart-heading"><div><h2 id="billing-trend-title">Penerimaan QRIS</h2><p className="dash-muted">Pembayaran lunas per tanggal pembayaran · WIB</p></div><div className="billing-period" role="group" aria-label="Periode penerimaan">{[7, 30].map((period) => <button type="button" key={period} aria-pressed={days === period} onClick={() => { setDays(period); setActiveDay(null); }}>{period} hari</button>)}</div></div>
        {trend.length ? <><strong className="billing-trend-total">{rupiah(total)}</strong><span className="billing-period-label"> dalam {days} hari terakhir</span><div className="billing-chart-readout" aria-live="polite">{selected ? <>{dayLabel(selected.date)} WIB <strong>{rupiah(selected.amount)}</strong></> : 'Arahkan kursor atau fokuskan batang untuk melihat nominal.'}</div><div className="billing-plot"><div className="billing-axis" aria-hidden="true"><span>{rupiah(maximum === 1 && total === 0 ? 0 : maximum)}</span><span>Rp0</span></div><div className="billing-bars" style={{ '--billing-days': trend.length }}>{trend.map((item) => <button key={item.date} type="button" className={`billing-bar${activeDay === item.date ? ' is-active' : ''}`} aria-label={`${dayLabel(item.date)} WIB: ${rupiah(item.amount)} penerimaan QRIS`} aria-describedby={activeDay === item.date ? 'billing-day-tooltip' : undefined} onMouseEnter={() => setActiveDay(item.date)} onMouseLeave={() => setActiveDay(null)} onFocus={() => setActiveDay(item.date)} onBlur={() => setActiveDay(null)} onClick={() => setActiveDay(item.date)} onKeyDown={(event) => { if (event.key === 'Escape') setActiveDay(null); }}><span className="billing-bar-fill" style={{ height: `${Math.max(item.amount > 0 ? 2 : 0, item.amount / maximum * 100)}%` }}/>{activeDay === item.date && <span id="billing-day-tooltip" role="tooltip" className="billing-tooltip">{dayLabel(item.date)} WIB<br/>{rupiah(item.amount)}</span>}</button>)}</div></div><div className="billing-chart-dates"><span>{dayLabel(trend[0].date)}</span><span>{dayLabel(trend[trend.length - 1].date)}</span></div>{total === 0 && <p className="dash-muted">Belum ada penerimaan QRIS pada periode ini.</p>}</> : <p className="dash-muted">Riwayat penerimaan belum tersedia.</p>}
      </section>
      <section className="dash-card billing-distribution" aria-labelledby="billing-status-title"><div className="billing-chart-heading"><div><h2 id="billing-status-title">Status pesanan</h2><p className="dash-muted">Semua pesanan · pilih status untuk memfilter</p></div></div>{statuses.length ? <><div className="billing-status-total"><strong>{formatCount(orderCount)}</strong><span> pesanan</span></div><div className="billing-status-diagram" role="group" aria-label="Diagram distribusi status pesanan">{statuses.filter((item) => item.count > 0).map((item) => <button type="button" key={item.status} className={`billing-segment billing-color-${item.status}`} style={{ flexGrow: item.count }} disabled={busy} aria-label={`${item.label}: ${formatCount(item.count)} pesanan. Filter tabel.`} aria-pressed={status === item.status} title={`${item.label}: ${formatCount(item.count)}`} onClick={() => onStatus(status === item.status ? '' : item.status)}/>)}</div>{!orderCount && <p className="dash-muted">Belum ada pesanan.</p>}<div className="billing-status-legend">{statuses.map((item) => <button type="button" key={item.status} disabled={busy} aria-pressed={status === item.status} onClick={() => onStatus(status === item.status ? '' : item.status)}><span className={`billing-status-dot billing-color-${item.status}`} aria-hidden="true"/><span>{item.label}</span><strong>{formatCount(item.count)}</strong></button>)}</div><button type="button" className="billing-reset" disabled={busy || !status} onClick={() => onStatus('')}>Tampilkan semua status</button></> : <p className="dash-muted">Distribusi status belum tersedia.</p>}</section>
    </div>
  </>;
}
