import type { Metadata } from 'next';
import { AxiomBrand } from '../../../components/axiom-brand';
import '../../qr/[id]/checkout.css';

export const metadata: Metadata = {
  title: 'Terima kasih — Axiom Payment',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ThankYou() {
  return (
    <main className="checkout-celebration">
      <section className="checkout-celebration-content checkout-thank-you" aria-labelledby="thank-you-title">
        <AxiomBrand />
        <h1 id="thank-you-title">TERIMA KASIH SUDAH MENGGUNAKAN AXIOM PAYMENT</h1>
        <p className="checkout-success-note">Anda dapat menutup halaman ini dengan aman.</p>
      </section>
    </main>
  );
}
