import LegalDocument from '../components/LegalDocument';
import { legalDocuments } from '../../lib/legal-content.mjs';

export const metadata = {
  title: 'Kebijakan privasi | AXIOM AI',
  description: legalDocuments.privacy.description,
  alternates: { canonical: '/privacy' },
  openGraph: { title: 'Kebijakan privasi | AXIOM AI', description: legalDocuments.privacy.description, url: '/privacy', type: 'website' },
};

export default function PrivacyPage() {
  return <LegalDocument document={legalDocuments.privacy} kind="privacy"/>;
}
