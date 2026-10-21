'use client';
import { useEffect, useState } from 'react';
import GlobalFeedback from '../../components/GlobalFeedback';
import Skeleton from '../../components/Skeleton';
import Icon from '../../components/Icon';
import DashboardShell from '../../components/DashboardShell';
import { date, number, useCustomerData } from '../components/CustomerData';
import { serviceState, summaryState, SLOW_THRESHOLD_MS } from './health-state.mjs';
import styles from './status.module.css';

const labels = { healthy: 'Operational', slow: 'Degraded', down: 'Outage', unknown: 'Belum diketahui' };
const summaries = {
  healthy: 'Semua layanan yang diperiksa merespons normal.',
  slow: 'Sebagian layanan lambat atau tidak tersedia. Periksa rincian layanan di bawah.',
  down: 'Pemeriksaan mendeteksi layanan yang tidak tersedia.',
  unknown: 'Belum ada hasil terkini yang cukup untuk memastikan kesehatan layanan.',
};
const serviceStages = [
  ['investigating', 'Investigasi'],
  ['fixing', 'Penanganan'],
  ['monitoring', 'Pemantauan'],
  ['resolved', 'Selesai'],
];
// ponytail: hasil berlaku 60 detik; gunakan masa berlaku server jika kontrak API menyediakannya.
const FRESHNESS_MS = 60000;

export default function StatusPage() {
  const resource = useCustomerData('status'), data = resource.data;
  const services = data?.services || [];
  const [maintenance, setMaintenance] = useState(null);
  const [maintenanceError, setMaintenanceError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const remaining = Date.parse(data?.checkedAt) + FRESHNESS_MS - Date.now();
    setExpired(!Number.isFinite(remaining) || remaining <= 0);
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [data?.checkedAt]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/site-api/maintenance', { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok || typeof result.enabled !== 'boolean') throw new Error('Status maintenance belum tersedia.');
        if (!controller.signal.aborted) { setMaintenance({ ...result, receivedAt: Date.now() }); setMaintenanceError(''); }
      } catch (error) {
        if (!controller.signal.aborted) setMaintenanceError('Status maintenance belum tersedia. Informasi sebelumnya mungkin sudah berubah.');
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [refresh]);
  const checkedAt = data?.checkedAt;
  const checkedTime = Date.parse(checkedAt);
  const stale = expired || !Number.isFinite(checkedTime) || Date.now() - checkedTime > FRESHNESS_MS || checkedTime > Date.now() + FRESHNESS_MS;
  const unavailable = resource.loading || Boolean(resource.error) || stale;
  const maintenanceKnown = maintenance && !maintenanceError && Date.now() - maintenance.receivedAt <= FRESHNESS_MS;
  const maintenanceActive = maintenanceKnown && maintenance.enabled === true;
  const serviceStates = services.map(service => serviceState(service, unavailable));
  const overall = summaryState(serviceStates, maintenanceKnown ? maintenance.enabled : null);
  const state = maintenanceActive ? 'down' : overall === 'down' && !serviceStates.every(health => health === 'down') ? 'slow' : overall;
  const headline = maintenanceActive ? 'Maintenance' : resource.loading ? 'Memeriksa layanan' : labels[state];
  return <DashboardShell title="System Status" description="Kondisi layanan berdasarkan pemeriksaan langsung, bukan estimasi uptime.">
    <div className={styles.page}>
      <section className={`${styles.overview} ${styles[state]}`} aria-labelledby="health-heading">
        <div className={styles.summary} role="status" aria-live="polite">
          <div><span className={styles.eyebrow}>Kesehatan sistem</span><h2 id="health-heading"><span className={styles.signal} aria-hidden="true" />{headline}</h2><p>{maintenanceActive ? 'Pemeliharaan sedang berlangsung. Sebagian akses dapat dibatasi meski health check merespons.' : resource.loading ? 'Mengambil hasil pemeriksaan terbaru…' : summaries[state]}</p></div>
        </div>
        <div className={styles.overviewFooter}>
          <div className={styles.lastCheck}><span>Pemeriksaan terakhir</span><strong>{Number.isFinite(checkedTime) ? <time dateTime={checkedAt}>{date(checkedAt)}</time> : 'Belum tersedia'}</strong>{!resource.loading && stale && checkedAt && <small>Hasil lebih dari 60 detik atau waktu tidak valid. Periksa kembali.</small>}</div>
          <button type="button" className={`dash-button ${styles.refresh}`} onClick={() => { resource.reload(); setRefresh(value => value + 1); }} disabled={resource.loading}>{resource.loading ? 'Memeriksa…' : 'Periksa sekarang'}</button>
        </div>
      </section>

      {resource.error && <GlobalFeedback><p>{resource.error}</p><p>Hasil terbaru tidak tersedia. Data sebelumnya tidak dianggap sebagai status saat ini. Gunakan “Periksa sekarang” untuk mencoba lagi.</p></GlobalFeedback>}
      {maintenanceError && <GlobalFeedback><p>{maintenanceError}</p></GlobalFeedback>}
      {maintenance?.enabled && <section className={`${styles.service} ${styles.maintenanceNotice}`} aria-labelledby="maintenance-notice">
        <div className={styles.serviceHeading}><h2 id="maintenance-notice">{maintenance.title || 'Pemeliharaan layanan'}</h2><span className={`${styles.state} ${styles.slow}`}>{maintenanceKnown ? 'Maintenance' : 'Informasi terakhir'}</span></div>
        <p className={styles.noticeMessage}>{maintenance.message}</p>
        <p>Estimasi selesai: {maintenance.estimatedEnd ? <time dateTime={maintenance.estimatedEnd}>{date(maintenance.estimatedEnd)}</time> : 'Belum ditentukan'}. Estimasi bukan jaminan waktu pemulihan.</p>
        {maintenance.updatedAt && <p>Diperbarui: <time dateTime={maintenance.updatedAt}>{date(maintenance.updatedAt)}</time></p>}
      </section>}

      <section aria-labelledby="services-heading" className={styles.serviceSection} aria-busy={resource.loading}>
        <div className={styles.sectionHeading}><h2 id="services-heading">Layanan</h2><span>{!unavailable && serviceStates.length > 0 && !serviceStates.includes('unknown') ? `${serviceStates.filter(health => health === 'down' || health === 'slow').length} dari ${services.length} layanan terganggu` : 'Hasil pemeriksaan aktual'}</span></div>
        {resource.loading && <Skeleton rows={3} variant="table" label="Memuat status layanan…" />}
        {!resource.loading && !services.length && <div className={styles.empty}><Icon name="/account/status" size={28} /><h3>Hasil layanan belum tersedia</h3><p>Tidak ada layanan yang dapat dinyatakan sehat. Coba periksa kembali.</p></div>}
        <div className={styles.services}>
          {services.length > 0 && <div className={styles.tableHeading} aria-hidden="true"><span>Layanan / pemeriksaan</span><span>Status</span><div><span>Latensi health check</span><span>HTTP</span></div></div>}
          {services.map(service => {
            const health = serviceState(service, unavailable);
            const measured = Number.isFinite(service.latencyMs) && service.latencyMs >= 0;
            return <article className={styles.serviceRow} key={service.id}>
              <div className={styles.serviceName}><h3>{service.name}</h3><p className={styles.message}>{unavailable ? 'Menunggu pemeriksaan terkini. Hasil sebelumnya tidak mewakili kondisi saat ini.' : service.message || 'Hasil pemeriksaan belum tersedia.'}</p></div>
              <span className={`${styles.state} ${styles[health]}`}><span className={styles.signal} aria-hidden="true" />{labels[health]}</span>
              <dl className={styles.metrics}>
                <div><dt>Latensi health check</dt><dd>{measured && !unavailable ? <>{number(service.latencyMs)} <span>ms</span></> : '—'}</dd>{(!measured || unavailable) && <small>Belum terukur saat ini</small>}</div>
                <div><dt>Status HTTP</dt><dd>{unavailable ? '—' : service.status == null ? 'Tidak ada respons' : service.status}</dd></div>
              </dl>
            </article>;
          })}
        </div>
      </section>

      <section className={styles.announcements} aria-labelledby="customer-announcements" aria-busy={resource.loading}>
        <div className={styles.noticeHeader}><div><Icon name="/account/updates" size={18} /><h2 id="customer-announcements">Pemberitahuan layanan</h2></div><span>{resource.loading ? 'Memperbarui…' : resource.error ? 'Data belum terverifikasi' : `${data?.notices?.length || 0} pengumuman aktif`}</span></div>
        {resource.loading && <Skeleton rows={2} label="Memuat pengumuman…" />}
        {resource.error && <div className={styles.noticeError} role="status"><div><strong>Pemberitahuan terbaru belum tersedia</strong><p>Informasi sebelumnya mungkin sudah berubah.</p></div><button type="button" className="dash-button" disabled={resource.loading} onClick={resource.reload}>Coba lagi</button></div>}
        <div className={styles.noticeList}>
          {data?.notices?.map(notice => <details className={styles.noticeItem} key={notice.id}>
            <summary><span className={styles.noticeMarker} aria-hidden="true" /><span className={styles.noticeTitle}><span className={styles.noticeCategory}>{notice.eventType || 'Informasi'}{resource.error ? ' · Data sebelumnya' : ''}</span><h3>{notice.title}</h3></span><span className={styles.noticeExpand} aria-hidden="true">+</span></summary>
            <div className={styles.noticeBody}><p className={styles.noticeMessage}>{notice.message}</p>
              {serviceStages.some(([stage]) => stage === notice.progress?.stage) && <div className={styles.noticeProgress}>
                <p className={styles.progressHeading}>Progres penanganan layanan</p>
                <ol className={styles.progressStages} aria-label="Urutan penanganan layanan">
                  {serviceStages.map(([stage, label]) => <li key={stage} aria-current={notice.progress.stage === stage ? 'step' : undefined}>
                    <span>{label}</span>{notice.progress.stage === stage && <strong>Saat ini</strong>}
                  </li>)}
                </ol>
                <p className={styles.progressNote}>Urutan alur, bukan riwayat tahap yang telah dilalui.</p>
                <p className={styles.progressNote}>Diperbarui admin: {Number.isFinite(Date.parse(notice.progress.updatedAt)) ? <time dateTime={notice.progress.updatedAt}>{date(notice.progress.updatedAt)}</time> : 'Waktu belum tersedia'}{resource.error ? ' · Data sebelumnya' : ''}</p>
              </div>}
              {(notice.startAt != null || notice.expiresAt != null) && <dl className={styles.noticeDates}>
                {notice.startAt != null && <div><dt>Mulai</dt><dd><time dateTime={new Date(notice.startAt).toISOString()}>{date(new Date(notice.startAt).toISOString())}</time></dd></div>}
                {notice.expiresAt != null && <div><dt>Berlaku sampai</dt><dd><time dateTime={new Date(notice.expiresAt).toISOString()}>{date(new Date(notice.expiresAt).toISOString())}</time></dd></div>}
              </dl>}
            </div>
          </details>)}
        </div>
        {!resource.loading && !resource.error && !data?.notices?.length && <div className={styles.noticeEmpty}><span className={styles.noticeEmptyIcon}><Icon name="/account/updates" size={22} /></span><div><h3>Belum ada pemberitahuan aktif</h3><p>Pengumuman layanan untuk akun Anda akan muncul di sini.</p></div></div>}
      </section>

      <details className={styles.legend}>
        <summary>Tentang pemeriksaan &amp; definisi status</summary>
        <p>Health check tidak mengirim inferensi atau transaksi pembayaran. Latensi mengukur respons endpoint kesehatan, bukan kecepatan generasi AI. Hasil berlaku 60 detik; periksa kembali untuk memperbarui.</p>
        <ul>
          <li><span className={`${styles.signal} ${styles.healthy}`} aria-hidden="true" /><span><strong>Operational</strong>Tersedia, latensi &lt; {SLOW_THRESHOLD_MS} ms.</span></li>
          <li><span className={`${styles.signal} ${styles.slow}`} aria-hidden="true" /><span><strong>Degraded</strong>Latensi ≥ {SLOW_THRESHOLD_MS} ms atau sebagian layanan tidak tersedia.</span></li>
          <li><span className={`${styles.signal} ${styles.down}`} aria-hidden="true" /><span><strong>Outage / Maintenance</strong>Pemeriksaan gagal atau pemeliharaan dikonfirmasi aktif.</span></li>
          <li><span className={`${styles.signal} ${styles.unknown}`} aria-hidden="true" /><span><strong>Belum diketahui</strong>Memuat, hasil kedaluwarsa, atau data belum lengkap.</span></li>
        </ul>
      </details>
    </div>
  </DashboardShell>;
}
