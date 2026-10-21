'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useResource } from '../lib/api';
import { CircleLoading, Failure } from './ui';

export const policyLinks = [
  ['terms-of-service', 'Syarat layanan'],
  ['privacy-policy', 'Privasi'],
  ['fee-policy', 'Biaya'],
  ['withdrawal-policy', 'Penarikan'],
  ['refund-policy', 'Refund'],
  ['acceptable-use-policy', 'Penggunaan'],
  ['complaint-policy', 'Pengaduan'],
] as const;

type Document = {
  title: string;
  version: string;
  effective_at: string;
  updated_at: string;
  published: boolean;
  missing: string[];
  sections: { id: string; heading: string; text: string }[];
};

export function PolicyFooter() {
  return (
    <nav className="policy-links" aria-label="Ketentuan dan kebijakan">
      {policyLinks.map(([slug, title]) => (
        <Link key={slug} href={`/${slug}`}>
          {title}
        </Link>
      ))}
    </nav>
  );
}

export function PublicHeader() {
  return (
    <header className="public-header glass-chrome">
      <Link className="brand" href="/dashboard"><b>a.</b><span>Axiom<small>Payment</small></span></Link>
      <nav aria-label="Navigasi utama">
        <Link href="/docs">Dokumentasi</Link>
        <Link className="button" href="/login">Masuk</Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer glass-chrome">
      <div className="public-footer-heading"><span className="brand"><b>a.</b>Axiom Payment</span><span>Nominal IDR · Waktu WIB</span></div>
      <PolicyFooter />
    </footer>
  );
}

export default function Policy({ slug, draft = false }: { slug: string; draft?: boolean }) {
  const [version, setVersion] = useState('');
  useEffect(() => {
    setVersion(new URLSearchParams(window.location.search).get('version') || '');
  }, []);
  const resource = useResource<{ document: Document }>(
    `/api/${draft ? 'admin/' : ''}policies/${slug}${version ? '?version=' + encodeURIComponent(version) : ''}`,
  );
  const document = resource.data?.document;

  return (
    <div className="public-page">
      <PublicHeader />
      <main className="docs-shell">
      {resource.loading ? (
        <CircleLoading />
      ) : resource.error ? (
        <>
          <h1>{policyLinks.find(([key]) => key === slug)?.[1] || 'Kebijakan'}</h1>
          <Failure error={resource.error} retry={resource.refresh} />
          <p>
            Kebijakan belum berlaku sebelum informasi pengelola dan peninjauan selesai. Halaman ini
            tidak memuat identitas atau izin rekaan.
          </p>
        </>
      ) : (
        document && (
          <>
            <h1>{document.title}</h1>
            {draft && (
              <p className="notice">
                Draf internal. Belum mendapat persetujuan hukum. Jangan dipublikasikan sebelum semua
                data diverifikasi.
              </p>
            )}
            <p className="hint">
              Versi {document.version} · Berlaku {document.effective_at} · Diperbarui{' '}
              {document.updated_at}
            </p>
            {draft && document.missing.length > 0 && (
              <p className="notice">Belum lengkap: {document.missing.join(', ')}</p>
            )}
            <nav aria-label="Daftar isi">
              <ol>
                {document.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.heading}</a>
                  </li>
                ))}
              </ol>
            </nav>
            {document.sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2>{section.heading}</h2>
                <p>{section.text}</p>
              </section>
            ))}
            <p className="hint">
              Rujukan: <a href="https://peraturan.go.id/id/uu-no-8-tahun-1999">UU 8/1999</a>,{' '}
              <a href="https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022">
                UU 27/2022
              </a>
              ,{' '}
              <a href="https://www.bi.go.id/id/publikasi/peraturan/Pages/PBI_102025.aspx">
                PBI 10/2025
              </a>
              . Rujukan bukan klaim layanan telah berizin.
            </p>
          </>
        )
      )}
      </main>
      <PublicFooter />
    </div>
  );
}
