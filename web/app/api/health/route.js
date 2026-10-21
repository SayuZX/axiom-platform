import { getHealth, unknownHealth } from '../../../lib/health.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

export async function GET() {
  try {
    return Response.json(await getHealth(), { headers });
  } catch {
    return Response.json(unknownHealth(), { status: 503, headers });
  }
}
