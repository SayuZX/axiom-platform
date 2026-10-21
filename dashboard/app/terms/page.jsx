import LegalDocument from '../components/LegalDocument';
import { legalDocuments } from '../../lib/legal-content.mjs';

export const metadata = {
  title: 'Ketentuan layanan | AXIOM AI',
  description: legalDocuments.terms.description,
  alternates: { canonical: '/terms' },
  openGraph: { title: 'Ketentuan layanan | AXIOM AI', description: legalDocuments.terms.description, url: '/terms', type: 'website' },
};

export default function TermsPage() {
  return <LegalDocument document={legalDocuments.terms} kind="terms"/>;
}
