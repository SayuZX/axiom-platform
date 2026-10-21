'use client';
import GlobalFeedback from '../../components/GlobalFeedback';
import Skeleton from '../../components/Skeleton';

import { useEffect, useState } from 'react';

export async function customerRequest(path, options = {}) {
  const response = await fetch('/customer-api/' + path, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('Respons dashboard tidak valid. Coba lagi nanti.'); }
  if (!response.ok) {
    if (response.status === 401 && data.code === 'customer_login_required' && typeof window !== 'undefined') {
      const next = window.location.pathname + window.location.search;
      window.location.assign('/account/login?next=' + encodeURIComponent(next));
    }
    throw Object.assign(new Error(data.error || 'Permintaan gagal.'), { status: response.status, code: data.code });
  }
  return data;
}
export function useCustomerData(path) {
  const [state, setState] = useState({ data: null, error: '', loading: true, path, unchanged: false });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ ...previous, data: previous.path === path ? previous.data : null, path, error: '', loading: true, unchanged: false }));
    customerRequest(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState(previous => ({ data, path, error: '', loading: false, unchanged: previous.data != null && JSON.stringify({ ...previous.data, checkedAt: null }) === JSON.stringify({ ...data, checkedAt: null }) }));
    }).catch(error => { if (!controller.signal.aborted) setState(previous => ({ ...previous, error: error.message, loading: false })); });
    return () => controller.abort();
  }, [path, version]);
  useEffect(() => {
    if (!/^(?:overview|keys|quota-history|logs|performance)(?:\?|$)/.test(path)) return;
    const refresh = () => { if (document.visibilityState === 'visible') setVersion(value => value + 1); };
    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [path]);
  return { ...state, data: state.path === path ? state.data : null, reload: () => setVersion(value => value + 1) };
}
export function DataState({ resource }) {
  if (resource.loading) return resource.data ? <p role="status">Memperbarui data…</p> : <Skeleton rows={4} label="Memuat data akun…" />;
  if (resource.error) return <GlobalFeedback><p>Data terbaru tidak tersedia. {resource.error}{resource.data ? ' Data sebelumnya tetap ditampilkan.' : ''}</p><button className="dash-button" onClick={resource.reload}>Coba lagi</button></GlobalFeedback>;
  return resource.data?.checkedAt ? <p className="dash-muted" role="status">{resource.unchanged ? 'Tidak ada data baru. ' : ''}Diperiksa {date(resource.data.checkedAt)} · Pembaruan data terakhir: {date(resource.data.lastUpdatedAt)}</p> : null;
}
export function Alert({ children, info = false }) { return children ? <GlobalFeedback info={info}>{children}</GlobalFeedback> : null; }
export const number = value => value == null ? 'Tidak tersedia' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
export const date = value => !value || !Number.isFinite(Date.parse(value)) ? '—' : new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
export const price = value => value == null ? 'Belum diatur' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(value);
export function Stat({ label, value, detail }) { return <section className="dash-card dash-stat"><span className="dash-muted">{label}</span><strong>{value}</strong>{detail && <small className="dash-muted">{detail}</small>}</section>; }
export function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CodeBlock({ value, name }) {
  const [notice, setNotice] = useState('');
  async function copy() { try { await navigator.clipboard.writeText(value); setNotice('Kode disalin.'); } catch { setNotice('Clipboard tidak tersedia. Pilih kode secara manual atau unduh berkas.'); } }
  return <><pre tabIndex={0}><code>{value}</code></pre><div className="dash-actions"><button type="button" className="dash-button" onClick={copy}>Salin kode</button>{name && <button type="button" className="dash-button" onClick={() => download(name, value)}>Unduh {name}</button>}</div>{notice && <GlobalFeedback info>{notice}</GlobalFeedback>}</>;
}
