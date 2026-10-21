'use client';

import { useEffect, useRef, useState } from 'react';

const INTERVAL = 30_000;
const states = {
  online: 'Online', offline: 'Offline', degraded: 'Terganggu', unknown: 'Belum diketahui',
  operational: 'Operasional', outage: 'Gangguan layanan', maintenance: 'Pemeliharaan',
  major_outage: 'Gangguan besar', partial_outage: 'Gangguan sebagian', degraded_performance: 'Performa menurun', under_maintenance: 'Pemeliharaan',
};

function secureUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function timestamp(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(value)) + ' WIB';
}

function StatusBattery({ state = 'unknown', label, stale = false, compact = false }) {
  const known = Object.hasOwn(states, state) ? state : 'unknown';
  const displayState = stale ? 'unknown' : known;
  return <div className={`status-battery state-${displayState}${compact ? ' battery-compact' : ''}`} data-state={displayState}>
    <div className="battery-caption"><span>{label || states[known]}{stale && ' · data lama'}</span><span className="battery-code" aria-hidden="true">{stale ? 'LAST SIGNAL' : 'CURRENT SIGNAL'}</span></div>
    <div className="battery-track" aria-hidden="true"><div className="battery-segments" /></div>
  </div>;
}

function Metric({ label, value, unit }) {
  return <div className="metric"><dt>{label}</dt><dd>{value ?? '—'}{value != null && unit && <span>{unit}</span>}</dd></div>;
}

export default function HealthDashboard({ initialSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(null);
  const refresh = useRef(null);

  useEffect(() => {
    let disposed = false;
    let controller = null;
    let timer;
    let deadline;
    const eligible = () => !document.hidden && navigator.onLine;
    const schedule = () => {
      clearTimeout(timer);
      if (!disposed && eligible()) timer = setTimeout(request, INTERVAL);
    };

    async function request() {
      if (disposed || controller || !eligible()) return;
      clearTimeout(timer);
      const current = new AbortController();
      controller = current;
      setBusy(true);
      deadline = setTimeout(() => current.abort(), 15_000);
      try {
        const response = await fetch('/api/health', { cache: 'no-store', signal: current.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Health unavailable');
        const data = await response.json();
        if (!Number.isFinite(Date.parse(data.checkedAt)) || !data.fivem || !data.cfx || !Array.isArray(data.cfx.components) || !Array.isArray(data.cfx.incidents)) throw new Error('Invalid snapshot');
        if (!disposed && controller === current) {
          setSnapshot(data);
          setError('');
          setNow(Date.now());
        }
      } catch {
        if (!disposed && controller === current) setError('Pembaruan gagal. Data terakhir dipertahankan; status terbaru belum dapat dipastikan.');
      } finally {
        if (controller === current) {
          clearTimeout(deadline);
          controller = null;
          if (!disposed) { setBusy(false); schedule(); }
        }
      }
    }

    function visibilityChanged() {
      setPaused(document.hidden);
      setOffline(!navigator.onLine);
      setNow(Date.now());
      if (!eligible()) {
        clearTimeout(timer);
        clearTimeout(deadline);
        const pending = controller;
        controller = null;
        pending?.abort();
        setBusy(false);
      } else request();
    }

    refresh.current = request;
    setNow(Date.now());
    setPaused(document.hidden);
    setOffline(!navigator.onLine);
    if (!initialSnapshot) request(); else schedule();
    const clock = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 5_000);
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('online', visibilityChanged);
    window.addEventListener('offline', visibilityChanged);
    return () => {
      disposed = true;
      refresh.current = null;
      clearTimeout(timer);
      clearTimeout(deadline);
      clearInterval(clock);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('online', visibilityChanged);
      window.removeEventListener('offline', visibilityChanged);
    };
  }, [initialSnapshot]);

  const fivem = snapshot?.fivem;
  const cfx = snapshot?.cfx;
  const checked = snapshot?.checkedAt ? Date.parse(snapshot.checkedAt) : NaN;
  const stale = Boolean(error || offline || (now !== null && Number.isFinite(checked) && now - checked > 65_000));
  const sourceUrl = secureUrl(cfx?.sourceUrl);
  const incidents = (cfx?.incidents ?? []).filter(incident => !['resolved', 'completed', 'postmortem'].includes(incident.state));

  return <>
    <section className="health-intro" aria-labelledby="health-title">
      <div><div className="eyebrow">AXM // SYSTEM OBSERVATORY</div><h1 id="health-title" className="health-title">STATUS<span>SISTEM_</span></h1><p className="health-description">Sinyal nyata. Tanpa asumsi.<br />Pantau server Axiom dan layanan resmi Cfx.re secara terpisah.</p></div>
      <div className="health-annotation" aria-hidden="true"><span>[ LIVE TELEMETRY ]</span><strong>02</strong><span>INDEPENDENT SIGNALS<br />ONE CLEAR PICTURE</span></div>
    </section>
    <section className="freshness" aria-label="Kesegaran data">
      <div><p className="freshness-label">{stale ? '[ ! ] DATA LAMA / BELUM TERVERIFIKASI' : snapshot ? '[ ↻ ] SNAPSHOT TERAKHIR' : '[ … ] MENUNGGU DATA'}</p><p>Dicek: <time dateTime={snapshot?.checkedAt}>{timestamp(snapshot?.checkedAt)}</time></p><p className="muted">{offline ? 'Perangkat offline. Pembaruan dijeda.' : paused ? 'Tab tersembunyi. Pembaruan dijeda.' : 'Pembaruan otomatis setiap 30 detik saat tab aktif.'}</p></div>
      <button className="refresh-button" type="button" onClick={() => refresh.current?.()} disabled={busy || offline || paused}>{busy ? 'MEMERIKSA…' : 'PERBARUI SEKARANG'} <span aria-hidden="true">↻</span></button>
    </section>
    <div className="health-notice" role="status" aria-live="polite">{error || (offline ? 'Koneksi perangkat terputus. Status yang ditampilkan bukan konfirmasi kondisi terbaru.' : stale ? 'Snapshot berusia lebih dari 65 detik. Tunggu pembaruan untuk memastikan kondisi terkini.' : busy ? 'Mengambil status terbaru…' : 'Status FiveM lokal tidak menentukan kesehatan layanan global Cfx.re, dan sebaliknya.')}</div>
    <div className="health-grid">
      <section className="health-card" aria-labelledby="fivem-title">
        <div className="card-kicker"><span>01 / AXIOM NETWORK</span><span>FIVEM</span></div>
        <div className="card-heading"><h2 id="fivem-title">Server Axiom</h2></div>
        <StatusBattery state={fivem?.state} label={fivem?.label} stale={stale} />
        <p className="card-message">{fivem?.message || 'Belum ada hasil pemeriksaan server FiveM.'}</p>
        <dl className="metrics"><Metric label="PEMAIN TERHUBUNG" value={fivem?.players} /><Metric label="KAPASITAS" value={fivem?.maxPlayers} /><Metric label="LATENSI PEMERIKSAAN" value={fivem?.latencyMs} unit="ms" /></dl>
        <div className="server-name"><span>NAMA SERVER</span><p>{fivem?.hostname || 'Belum tersedia'}</p></div>
        <p className="card-note">Latensi diukur dari VPS ke endpoint HTTP, bukan ping pemain dalam game. — berarti data tidak tersedia, bukan nol. Portal masih pre-launch; status online bukan pengumuman pembukaan akses kota.</p>
      </section>
      <section className="health-card" aria-labelledby="cfx-title">
        <div className="card-kicker"><span>02 / EXTERNAL NETWORK</span><span>CFX.RE</span></div>
        <div className="card-heading"><h2 id="cfx-title">Layanan Cfx.re</h2></div>
        <StatusBattery state={cfx?.state} label={cfx?.label} stale={stale} />
        {cfx?.message ? <p className="card-message">{cfx.message}</p> : (!cfx || cfx.state === 'unknown') ? <p className="card-message">Status resmi Cfx.re belum tersedia.</p> : null}
        <div className="component-list">{cfx?.components?.length ? cfx.components.map(component => <div className="component-row" key={component.id}><span>{component.name}</span><StatusBattery state={component.state} label={component.label} stale={stale} compact /></div>) : <p className="empty-state">Belum ada data komponen yang dapat ditampilkan.</p>}</div>
        <div className="source-line"><p>{cfx?.updatedAt ? <>Pembaruan sumber: <time dateTime={cfx.updatedAt}>{timestamp(cfx.updatedAt)}</time></> : 'Sumber tidak menyediakan waktu perubahan status; waktu pemeriksaan ada di atas.'}</p>{sourceUrl && <a className="text-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">Status resmi Cfx.re ↗<span className="sr-only"> (tab baru)</span></a>}</div>
      </section>
    </div>
    <section className="incident-section" aria-labelledby="incidents-title">
      <div className="section-heading"><div><p className="card-kicker">OFFICIAL TRANSMISSIONS</p><h2 id="incidents-title">Insiden aktif Cfx.re</h2></div><span className="section-tag">SUMBER EKSTERNAL</span></div>
      {incidents.length ? <ul className="incident-list">{incidents.map(incident => {
        const url = secureUrl(incident.url);
        return <li key={incident.id}><div><span className="incident-state">{incident.state}</span><h3>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{incident.title} ↗<span className="sr-only"> (tab baru)</span></a> : incident.title}</h3><p>Diperbarui: <time dateTime={incident.updatedAt ?? undefined}>{timestamp(incident.updatedAt)}</time></p></div></li>;
      })}</ul> : <p className="empty-state">{cfx?.incidentsAvailable === false ? 'Sumber status tidak menyediakan daftar insiden terpisah. Lihat halaman status resmi untuk informasi tambahan.' : !cfx || cfx.state === 'unknown' ? 'Data insiden belum dapat diverifikasi. Periksa kembali setelah sumber tersedia.' : 'Tidak ada insiden aktif yang dilaporkan pada snapshot ini.'}</p>}
    </section>
    <div className="health-footnote"><span>[ STATUS SIGNAL LEGEND ]</span><div><ul className="battery-legend" aria-label="Arti warna indikator"><li className="state-online">Online / operasional</li><li className="state-offline">Offline / gangguan</li><li className="state-degraded">Terganggu / pemeliharaan</li><li className="state-unknown">Belum diketahui / data lama</li></ul><p>Garis baterai menunjukkan status pemeriksaan saat ini, bukan persentase kapasitas atau riwayat uptime. Semua segmen satu indikator mewakili status yang sama.</p></div></div>
  </>;
}
