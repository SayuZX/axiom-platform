import { timingSafeEqual } from 'node:crypto';

export const PUBLIC_ORIGIN = 'https://ai.axiomcreative.xyz';
export const MERCHANT_COOKIE = 'axiom_merchant_session';
export function fail(status, message, code = 'request_failed') { return Object.assign(new Error(message), { status, code }); }
export function cookieValue(request, name) {
  const value = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1);
  try { return value ? decodeURIComponent(value) : null; } catch { return null; }
}
export function sessionCookie(token, clear = false) {
  return `${MERCHANT_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear ? 0 : 43200}`;
}
export function requireOrigin(request) {
  if (request.headers.get('origin') !== PUBLIC_ORIGIN) throw fail(403, 'Origin permintaan tidak diizinkan.', 'origin_denied');
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('application/json')) throw fail(415, 'Gunakan application/json.', 'content_type');
}
export async function boundedText(request, limit = 65536) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw fail(413, 'Isi permintaan terlalu besar.', 'body_too_large');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function bodyJson(request) {
  let data;
  try { data = JSON.parse(await boundedText(request)); } catch (e) { if (e.status) throw e; throw fail(400, 'JSON tidak valid.', 'invalid_json'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, 'Objek JSON diperlukan.', 'invalid_json');
  return data;
}
export function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export function errorResponse(error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
  return json({ error: error?.status ? error.message : 'Layanan pembayaran sementara tidak tersedia.', code: error?.status ? error.code : 'service_unavailable' }, status);
}
export function validEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Alamat email tidak valid.', 'invalid_email');
  return email;
}
export function sameSecret(a, b) {
  const x = Buffer.from(a || ''); const y = Buffer.from(b || '');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
export function clientIp(request) { return request.headers.get('x-axiom-client-ip') || 'unidentified'; }
export async function routerAdmin(request) {
  const cookie = request.headers.get('cookie') || '';
  if (!cookieValue(request, 'auth_token')) return false;
  const response = await fetch('http://127.0.0.1:20128/api/auth/status', { headers: { cookie, 'X-Forwarded-For': clientIp(request), 'X-Forwarded-Proto': 'https' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) return false;
  const data = await response.json();
  return data.authenticated === true;
}
export async function routerSettings(request, { method = 'GET', body } = {}) {
  const headers = { cookie: request.headers.get('cookie') || '', 'X-Forwarded-For': clientIp(request), 'X-Forwarded-Proto': 'https' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch('http://127.0.0.1:20128/api/settings', { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw fail(response.status === 401 ? 401 : 502, data?.error || 'Pengaturan router belum dapat diakses.', response.status === 401 ? 'admin_required' : 'router_unavailable');
  return data;
}

export async function merchantRequest(path, apiKey, { method = 'GET', body } = {}) {
  if (!/^\/api\/[a-zA-Z0-9/_-]+(?:\?[a-zA-Z0-9_=&%-]+)?$/.test(path)) throw fail(500, 'Rute merchant tidak valid.');
  const headers = { 'X-API-Key': apiKey || '', 'Content-Type': 'application/json' };
  if (path === '/api/auth/owner') {
    const secret = process.env.OWNER_SETUP_KEY;
    if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw fail(503, 'Pengaturan privat merchant belum tersedia.', 'configuration_required');
    headers['X-Owner-Setup-Key'] = secret;
  }
  try {
    const response = await fetch('http://127.0.0.1:3082' + path, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000),
    });
    const raw = await boundedText(response, 2 * 1024 * 1024);
    let data;
    try { data = JSON.parse(raw); } catch { throw fail(502, 'Respons merchant tidak valid.', 'upstream_invalid'); }
    if (!response.ok) {
      if (response.status === 401) throw fail(409, 'Sesi GoPay situs perlu dihubungkan kembali oleh pemilik.', 'merchant_reconnect_required');
      const message = response.status === 403 ? 'Akun ini tidak memiliki izin untuk operasi tersebut.' : response.status === 404 ? 'Transaksi tidak ditemukan untuk akun ini.' : response.status === 429 ? 'Terlalu banyak permintaan merchant.' : response.status >= 500 ? 'Provider merchant belum tersedia. Coba lagi.' : String(data.error || 'Permintaan merchant ditolak.').slice(0,220);
      throw fail(response.status, message, 'merchant_rejected');
    }
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw fail(503, 'Backend GoPay Merchant belum tersedia atau tidak merespons.', 'merchant_unavailable');
  }
}

export async function qrImage(payment) {
  if (payment?.status !== 'pending' || typeof payment.qr_image_url !== 'string') throw fail(404, 'QRIS tidak tersedia.', 'qr_unavailable');
  let url;
  try { url = new URL(payment.qr_image_url); } catch { throw fail(502, 'Alamat QRIS provider tidak valid.', 'qr_invalid'); }
  if (url.origin !== 'https://api.midtrans.com' || url.username || url.password || url.search || url.hash || !/^\/v2\/qris\/[a-zA-Z0-9_-]+\/qr-code(?:-v2)?$/.test(url.pathname) || url.pathname.split('/')[3] !== payment.transaction_id) throw fail(502, 'Alamat QRIS provider tidak diizinkan.', 'qr_invalid');
  const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const type = response.headers.get('content-type')?.split(';')[0].trim();
  if (!response.ok || !['image/png','image/jpeg','image/webp','image/gif'].includes(type) || !response.body) throw fail(502, 'Gambar QRIS provider tidak tersedia.', 'qr_unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw fail(502, 'Gambar QRIS terlalu besar.', 'qr_invalid');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!size) throw fail(502, 'Gambar QRIS kosong.', 'qr_invalid');
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': type, 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' } });
}
