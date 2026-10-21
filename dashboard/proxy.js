import { NextResponse } from 'next/server';
import { readMaintenance } from './lib/maintenance.mjs';

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  if (['/terms', '/privacy', '/changelog'].includes(pathname)) return NextResponse.next();
  if (pathname === '/native-panels.js' || pathname === '/native-panels.css' || pathname === '/axiom-feedback.js') return NextResponse.next();
  // Exempt customer routes from maintenance only; their session/auth checks still apply.
  // Inference (/api, /v1, /v1beta) remains gated by the native gateway.
  if (/^\/(?:maintenance|manage|manage-api|merchant-api|commerce-api|site-api|native-theme|dashboard|account|account-api|customer-api|wallet-api|login|logout|api|v1|v1beta|_next|ai-assets|fonts|provider-logos)(?:\/|$)/.test(pathname) || /\.(?:svg|ico|png|webp|woff2?)$/.test(pathname)) return NextResponse.next();
  let settings;
  try { settings = readMaintenance(); } catch { return new NextResponse('Konfigurasi layanan belum tersedia.', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } }); }
  if (!settings.enabled) return NextResponse.next();
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.json({ error: { code: 'maintenance', message: settings.message } }, { status: 503, headers: { 'Retry-After': String(settings.retryAfter), 'Cache-Control': 'no-store' } });
  const url = request.nextUrl.clone();
  url.pathname = '/maintenance';
  url.search = '';
  return NextResponse.redirect(url, { status: 307, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(settings.retryAfter) } });
}
export const config = { matcher: '/:path*' };
