// JavaScript, app/merchant/layout.jsx, Next.js 16: site-admin-only merchant settings.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { routerAdmin } from '../../lib/merchant-http.mjs';

export const dynamic = 'force-dynamic';

export default async function MerchantLayout({ children }) {
  if (!await routerAdmin({ headers: await headers() })) redirect('/login');
  return children;
}
