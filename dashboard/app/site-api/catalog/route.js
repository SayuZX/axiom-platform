import { getSiteCatalog } from '../../../lib/site-catalog.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const catalog = await getSiteCatalog();
  return Response.json(catalog, {
    status: catalog.available ? 200 : 503,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
