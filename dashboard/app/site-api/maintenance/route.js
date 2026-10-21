import { readMaintenance } from '../../../lib/maintenance.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  try { return Response.json(readMaintenance(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Konfigurasi layanan belum tersedia.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
