import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { routerAdmin } from '../../lib/merchant-http.mjs';

export const dynamic = 'force-dynamic';

export default async function ManageLayout({ children }) {
  if (!await routerAdmin({ headers: await headers() })) redirect('/login');
  return children;
}
