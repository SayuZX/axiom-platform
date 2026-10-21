'use client';
import { Failure } from '../components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="centered">
      <Failure error={new Error('Halaman belum dapat dimuat. Silakan coba lagi.')} retry={reset} />
    </main>
  );
}
