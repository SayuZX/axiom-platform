import './globals.css';
import SiteChrome from './components/SiteChrome';

export const metadata = {
  metadataBase: new URL('https://axiomcreative.xyz'),
  title: { default: 'AXIOM CREATIVE — Coming Soon', template: '%s — AXIOM CREATIVE' },
  description: 'Axiom Creative. Sebuah kota, ribuan kemungkinan. Portal komunitas FiveM segera hadir.',
  openGraph: { siteName: 'Axiom Creative', locale: 'id_ID', type: 'website' },
};

export const viewport = { themeColor: '#101110' };

export default function RootLayout({ children }) {
  return <html lang="id"><body><SiteChrome>{children}</SiteChrome></body></html>;
}
