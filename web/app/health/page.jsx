import { getHealth } from '../../lib/health.mjs';
import HealthDashboard from '../components/HealthDashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata = {
  title: 'Status Sistem',
  description: 'Status server FiveM Axiom dan layanan resmi Cfx.re. Pemeriksaan terkini, waktu pembaruan, serta insiden aktif.',
  alternates: { canonical: '/health' },
  openGraph: { title: 'Status Sistem — AXIOM CREATIVE', description: 'Pantau status FiveM Axiom dan layanan resmi Cfx.re secara terpisah.', url: '/health' },
};

export default async function HealthPage() {
  const snapshot = await getHealth();
  return <main id="main" className="health-main" tabIndex={-1}><HealthDashboard initialSnapshot={snapshot} /></main>;
}
