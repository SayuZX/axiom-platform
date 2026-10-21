import DashboardShell from '../../components/DashboardShell';
import Updates from '../../components/Updates';

export const metadata = {
  title: 'Pembaruan produk | AXIOM',
  robots: { index: false, follow: false }
};

export default function AccountUpdatesPage() {
  return (
    <DashboardShell
      title="Pembaruan produk"
      description="Catatan rilis model baru, spesifikasi teknis, dan skema tarif AXIOM AI. Semua tanggal memakai zona waktu WIB."
    >
      <Updates endpoint="/site-api/announcements" />
    </DashboardShell>
  );
}
