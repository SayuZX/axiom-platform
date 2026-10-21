import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadCustomer } from '../../lib/customer-auth.mjs';
import './playground-host.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Playground — AXIOM AI' };
export default async function PlaygroundPage() {
  const customer = await loadCustomer({ headers: await headers() });
  if (!customer) redirect('/account/login?next=%2Fplayground');
  return <main className="axiom-chat-host" aria-label="Playground AXIOM AI"><iframe title="Playground AXIOM AI" src="/axiom-chat/index.html" allow="clipboard-write" /></main>;
}
