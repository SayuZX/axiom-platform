import './globals.css';
import './dashboard.css';
import './public-mobile.css';
import { themeScript } from '../lib/theme.mjs';

export const metadata = {
  title: 'AXIOM AI — API Key & Paket Token AI Sesuai Anggaran',
  description: 'Pilih API key dan paket token AI sesuai anggaran. Bandingkan model, hitung kebutuhan kredit AI, dan lihat paket dalam Rupiah dengan pembayaran QRIS.',
  metadataBase: new URL('https://ai.axiomcreative.xyz'),
  icons: { icon: '/axiom-ai.svg', apple: '/axiom-ai.svg' },
};

export default function RootLayout({ children }) {
  return <html lang="id" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }}/><script type="module" src="/axiom-feedback.js?v=3" /></head><body>{children}</body></html>;
}
