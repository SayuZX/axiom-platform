import Home from './Home';

const title = 'API Key & Paket Token AI Sesuai Anggaran — AXIOM AI';
const description = 'Cari akses AI yang terjangkau sesuai kebutuhan. Bandingkan paket token, hitung kredit AI dalam Rupiah, dan gunakan API key AXIOM melalui endpoint kompatibel OpenAI.';
export const metadata = {
  title, description,
  alternates: { canonical: '/' },
  openGraph: { title, description, url: '/', siteName: 'AXIOM AI', locale: 'id_ID', type: 'website' },
  twitter: { card: 'summary', title, description },
};

export default function Page() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'AXIOM AI', url: 'https://ai.axiomcreative.xyz/', inLanguage: 'id', description }) }}/><Home/></>;
}
