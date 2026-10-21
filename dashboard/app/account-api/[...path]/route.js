import { customerSessionCookie, loadCustomer, registerCustomer, loginCustomer, logoutCustomer } from '../../../lib/customer-auth.mjs';
import { requireOrigin, bodyJson, json, errorResponse, fail } from '../../../lib/merchant-http.mjs';
import { requireCustomer } from '../../../lib/customer-auth.mjs';
import { routerDb } from '../../../lib/merchant-commerce.mjs';
import { initializeAnnouncements, listAnnouncements } from '../../../lib/announcements.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request, context) {
  try {
    const { path } = await context.params;
    const route = path.join('/');
    if (request.method === 'GET' && route === 'announcements') {
      await requireCustomer(request);
      const db = routerDb(); initializeAnnouncements(db);
      return json({ items: listAnnouncements(db, 'customers') });
    }
    if (request.method === 'GET' && route === 'session') {
      const customer = await loadCustomer(request);
      return json({ authenticated: Boolean(customer), customer });
    }
    if (request.method === 'POST') {
      requireOrigin(request);
      if (route === 'register' || route === 'login') {
        const input = await bodyJson(request);
        const { customer, token } = await (route === 'register' ? registerCustomer(request, input) : loginCustomer(request, input));
        return json({ authenticated: true, customer }, route === 'register' ? 201 : 200, { 'Set-Cookie': customerSessionCookie(token) });
      }
      if (route === 'logout') {
        await bodyJson(request);
        await logoutCustomer(request);
        return json({ authenticated: false, customer: null }, 200, { 'Set-Cookie': customerSessionCookie('', true) });
      }
    }
    throw fail(404, 'Halaman tidak ditemukan.', 'not_found');
  } catch (error) {
    return errorResponse(error?.status ? error : fail(503, 'Layanan akun sementara tidak tersedia. Coba lagi nanti.', 'service_unavailable'));
  }
}

export function GET(request, context) { return handle(request, context); }
export function POST(request, context) { return handle(request, context); }
