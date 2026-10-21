import { requireCustomer } from '../../../lib/customer-auth.mjs';
import { bodyJson, errorResponse, fail, json, requireOrigin } from '../../../lib/merchant-http.mjs';
import { customerOverview, customerKeys, customerLogs, customerPerformance, customerStatus, revealCustomerKey, updateCustomerKey } from '../../../lib/customer-dashboard.mjs';
import { getSiteCatalog } from '../../../lib/site-catalog.mjs';
import { customerQuotaHistory } from '../../../lib/customer-quota-history.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 100;

async function handle(request, context) {
  try {
    if (request.method === 'POST' || request.method === 'PUT') requireOrigin(request);
    const customer = await requireCustomer(request);
    const { path } = await context.params;
    const route = path.join('/');
    if (request.method === 'GET') {
      if (route === 'overview') return json(await customerOverview(customer));
      if (route === 'keys') return json(await customerKeys(customer));
      if (route === 'quota-history') return json(await customerQuotaHistory(customer, new URL(request.url).searchParams));
      if (route === 'logs') return json(await customerLogs(customer, new URL(request.url).searchParams));
      if (route === 'performance') return json(await customerPerformance(customer));
      if (route === 'status') return json(await customerStatus(customer));
      if (route === 'catalogue') {
        const catalogue = await getSiteCatalog();
        if (!catalogue.available) throw fail(503, 'Katalog router sementara tidak tersedia.', 'catalog_unavailable');
        return json(catalogue);
      }
    }
    if (request.method === 'POST') {
      if (path.length === 3 && path[0] === 'keys' && path[2] === 'reveal') return json(await revealCustomerKey(customer, path[1]));
      if (path.length === 2 && path[0] === 'keys') return json(await updateCustomerKey(customer, path[1], await bodyJson(request)));
    }
    throw fail(404, 'Halaman tidak ditemukan.', 'not_found');
  } catch (error) {
    return errorResponse(error?.status ? error : fail(503, 'Data dashboard sementara tidak tersedia. Coba lagi nanti.', 'service_unavailable'));
  }
}
export function GET(request, context) { return handle(request, context); }
export function POST(request, context) { return handle(request, context); }
