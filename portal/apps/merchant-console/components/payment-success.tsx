'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AxiomBrand } from './axiom-brand';
import { money } from '../lib/api';

export function PaymentSuccess({ amount }: { amount: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => router.replace('/payment/thank-you'), 4000);
    return () => window.clearTimeout(timer);
  }, [router]);
  return (
    <section className="checkout-celebration-content" aria-labelledby="success-title">
      <AxiomBrand />
      <div className="checkout-success-art" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => <span className={`checkout-coin checkout-coin-${index}`} key={index}>Rp</span>)}
        <svg className="checkout-success-check" viewBox="0 0 120 120" fill="none">
          <circle className="checkout-check-disc" cx="60" cy="60" r="56" fill="currentColor" />
          <path className="checkout-check-stroke" d="m34 61 17 17 35-36" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h1 id="success-title">PEMBAYARAN BERHASIL</h1>
        <p className="checkout-success-amount">{money(amount)}</p>
        <p className="checkout-success-note">Pembayaran telah dikonfirmasi. Tidak perlu membayar lagi.</p>
      </div>
      <p className="checkout-success-next">Anda akan dialihkan ke halaman terima kasih dalam 4 detik.</p>
      <Link className="button" href="/payment/thank-you" replace>Lanjutkan sekarang</Link>
    </section>
  );
}
