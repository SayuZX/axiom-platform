import { routerDb } from '../../../lib/merchant-commerce.mjs';
import { initializeAnnouncements, listAnnouncements } from '../../../lib/announcements.mjs';
import { json } from '../../../lib/merchant-http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  try { const db = routerDb(); initializeAnnouncements(db); return json({items:listAnnouncements(db)}); }
  catch { return json({error:'Pembaruan belum dapat dimuat. Coba lagi.'},503); }
}
