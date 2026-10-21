import { useEffect, useState } from 'react';
import { getAxiomSession, notifyAxiom } from '../lib/axiom';
import { loadEndpointStore } from '../lib/endpointProfiles';
import { fetchKeyUsage, modelLabel, type KeyUsage } from '../lib/axiomPresentation';

export function AxiomUsage() {
  const [keyId, setKeyId] = useState(() => loadEndpointStore().selectedId || getAxiomSession().keys[0]?.id || '');
  const [usage, setUsage] = useState<KeyUsage | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const session = getAxiomSession();
  useEffect(() => {
    const changed = () => { setKeyId(loadEndpointStore().selectedId || getAxiomSession().keys[0]?.id || ''); setRefresh(value => value + 1); };
    const completed = () => setRefresh(value => value + 1);
    window.addEventListener('client-endpoints-changed', changed);
    window.addEventListener('axiom-usage-changed', completed);
    return () => { window.removeEventListener('client-endpoints-changed', changed); window.removeEventListener('axiom-usage-changed', completed); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setUsage(null); setError('');
    if (keyId) void fetchKeyUsage(keyId, controller.signal).then(value => { if (!controller.signal.aborted) setUsage(value); }, failure => { if (!controller.signal.aborted) { setError(failure.message); notifyAxiom(failure.message); } });
    return () => controller.abort();
  }, [keyId, refresh]);
  const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 6 });
  const number = new Intl.NumberFormat('id-ID');
  const maximum = Math.max(0, ...(usage?.daily.map(day => day.debitedTokens) || []));
  return <div className="axiom-usage" aria-label="Usage & billing">
    {!keyId ? <p>Belum ada API key tersedia.</p> : error ? <p role="alert">{error}</p> : !usage ? <p role="status">Memuat penggunaan…</p> : <>
      <section className="axiom-usage-progress" aria-label="Kuota token tersisa"><div><strong>Sisa kuota token</strong><span>{usage.remainingTokens === null ? 'Tanpa batas' : `${number.format(usage.remainingTokens)} dari ${number.format(usage.tokenLimit)} token`}</span></div>{usage.remainingTokens !== null && usage.tokenLimit > 0 && <progress aria-label="Sisa kuota token" value={Math.min(usage.remainingTokens, usage.tokenLimit)} max={usage.tokenLimit}/>}</section>
      <section className="d-settings-section"><h2>Debit 7 hari terakhir</h2><div className="d-settings-group"><div className="d-settings-usage-bars" role="list" aria-label="Debit token per hari UTC">{usage.daily.map(day => <div key={day.date} role="listitem" aria-label={`${day.date}: ${number.format(day.debitedTokens)} token debit`} title={`${day.date}: ${number.format(day.debitedTokens)} token debit`}><i aria-hidden="true" style={{ height: day.debitedTokens && maximum ? `${Math.max(6, day.debitedTokens / maximum * 100)}%` : 0 }}/><span aria-hidden="true">{new Date(`${day.date}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' })}</span></div>)}</div><p className="axiom-usage-caption">Tanggal menggunakan UTC. Batang kosong berarti tidak ada debit tercatat.</p></div></section>
      <section className="d-settings-section"><h2>Permintaan terbaru</h2><div className="d-settings-group axiom-usage-history">{usage.recent.length ? usage.recent.map((row, index) => <div className="d-settings-row" key={`${row.requestedAt}-${index}`}><div><b>{modelLabel(row.model, session.models)}</b><p>{new Date(row.requestedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p></div><div className="axiom-usage-entry"><strong>{row.debitTokens === null ? 'Belum dibukukan' : `${number.format(row.debitTokens)} token debit`}</strong><span>{row.saleCostIdr === null ? 'Nilai belum tersedia' : idr.format(row.saleCostIdr)}</span><small>{row.inputTokens === null ? '—' : number.format(row.inputTokens)} input · {row.outputTokens === null ? '—' : number.format(row.outputTokens)} output</small></div></div>) : <p>Belum ada permintaan tercatat.</p>}</div></section>
      <p className="axiom-usage-caption">Kuota terpakai termasuk penggunaan lama. Debit dan nilai penggunaan mengikuti catatan baru.</p>
    </>}
  </div>;
}
