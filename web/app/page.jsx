import Link from 'next/link';
import CityArt from './components/CityArt';
import Transmission from './components/Transmission';

export const metadata = {
  title: { absolute: 'AXIOM CREATIVE — Coming Soon' },
  alternates: { canonical: '/' },
  openGraph: { title: 'AXIOM CREATIVE — Coming Soon', description: 'Sebuah kota, ribuan kemungkinan. Transmisi berikutnya segera dimulai.', url: '/' },
};

export default function Home() {
  return <main id="main" tabIndex={-1}>
    <section className="hero" aria-labelledby="headline">
      <div className="hero-copy">
        <div className="eyebrow">AXIOM CREATIVE // TRANSMISSION 001</div>
        <h1 id="headline"><span className="title-line">COMING</span><span className="title-line soon" data-word="SOON_">SOON<span className="underscore">_</span></span></h1>
        <p className="lead">Sebuah kota.<br />Ribuan kemungkinan.</p>
        <p className="description">Di balik layar, sesuatu sedang dibangun.<br />Tempat cerita baru dimulai. Bersiaplah untuk<br className="desktop-break" /> menjadi bagian dari Axiom.</p>
        <div className="actions"><Transmission /><span className="small-tag">FIVEM COMMUNITY<b>COMING SOON</b></span></div>
        <Link className="text-link hero-health" href="/health">Lihat status FiveM & Cfx.re <span aria-hidden="true">↗</span></Link>
      </div>
      <CityArt />
    </section>
    <div className="ticker" aria-label="Status proyek"><span><strong>[ ! ]</strong> DEVELOPMENT IN PROGRESS</span><span className="slash" aria-hidden="true">////////////////</span><span>LAUNCH DATE <strong>TO BE ANNOUNCED</strong></span><span className="end">AXIOM / CHAPTER 01</span></div>
    <section className="info" id="about" aria-label="Tentang Axiom Creative">
      <div className="info-item"><span className="info-index">01 /</span><div><h2>BUKAN SEKADAR KOTA.</h2><p>Ruang untuk bertemu, berkreasi, dan menulis ceritamu sendiri.</p></div></div>
      <div className="info-item"><span className="info-index">02 /</span><div><h2>DIBANGUN UNTUK KOMUNITAS.</h2><p>Portal menuju dunia FiveM Axiom. Akses masuk belum dibuka.</p></div></div>
      <div className="info-item"><span className="info-index">03 /</span><div><h2>TRANSMISI BELUM BERAKHIR.</h2><p>Informasi peluncuran akan diumumkan di halaman ini.</p></div></div>
    </section>
  </main>;
}
