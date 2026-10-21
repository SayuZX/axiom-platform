import Link from 'next/link';

export default function NotFound() {
  return <main id="main" className="not-found" tabIndex={-1}>
    <p className="eyebrow">AXM // SIGNAL NOT FOUND</p>
    <h1>404<span className="acid">_</span></h1>
    <h2>Transmisi tidak ditemukan.</h2>
    <p>Alamat ini belum menjadi bagian dari kota. Kembali ke titik awal atau periksa status sistem.</p>
    <div className="actions"><Link className="primary" href="/">KEMBALI KE BERANDA ↗</Link><Link className="text-link" href="/health">STATUS SISTEM ↗</Link></div>
  </main>;
}
