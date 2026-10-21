import type { Metadata } from 'next';
import { PublicCheckout } from '../../../components/payment-detail';
import './checkout.css';

export const metadata: Metadata = {
  title: 'Pembayaran QRIS',
  description: 'Rincian dan status pembayaran QRIS.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Checkout({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="checkout-shell">
      <PublicCheckout key={id} id={id} />
      <noscript>Aktifkan JavaScript untuk memuat QRIS dan memeriksa status pembayaran.</noscript>
    </main>
  );
}
