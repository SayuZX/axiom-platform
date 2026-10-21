import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="centered">
      <h1>Halaman tidak ditemukan</h1>
      <p>Periksa alamat halaman atau kembali ke dashboard.</p>
      <Link className="button primary" href="/dashboard">
        Buka dashboard
      </Link>
    </main>
  );
}
