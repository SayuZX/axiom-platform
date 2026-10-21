import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PaymentSuccess } from '../../../../components/payment-success';
import { confirmedPaymentAmount } from '../../../../lib/payment-success';
import '../checkout.css';

export const metadata: Metadata = {
  title: 'Pembayaran berhasil',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

export default async function Success({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let amount: number | null = null;
  try {
    const backend = process.env.BACKEND_URL || 'http://127.0.0.1:3083';
    const response = await fetch(`${backend}/api/qr-status/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      headers: { 'X-Axiom-Request': '1' },
      signal: AbortSignal.timeout(35000),
    });
    if (response.ok) amount = confirmedPaymentAmount(await response.json(), id);
  } catch {
    // Never present a successful payment when server verification is unavailable.
  }
  if (amount === null) redirect(`/qr/${encodeURIComponent(id)}`);
  return <main className="checkout-celebration"><PaymentSuccess amount={amount} /><noscript>Pembayaran berhasil. Buka <a href="/payment/thank-you">halaman terima kasih</a> untuk melanjutkan.</noscript></main>;
}
