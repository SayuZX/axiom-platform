import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Axiom Payment', template: '%s — Axiom Payment' },
  description: 'Pengelolaan pembayaran QRIS, transaksi, dan penarikan Axiom Payment.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
