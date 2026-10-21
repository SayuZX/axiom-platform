import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { merchantDb, hashToken, rateLimit } from './merchant-store.mjs';
import { clientIp, cookieValue, fail, validEmail } from './merchant-http.mjs';

export const CUSTOMER_COOKIE = 'axiom_customer_session';
// Service terms acceptance and privacy notice acknowledgement, not optional processing consent.
export const CUSTOMER_LEGAL_VERSION = '2026-10-18';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const derivePassword = promisify(scrypt);
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const DUMMY_SALT = randomBytes(16);
const DUMMY_HASH = Buffer.alloc(32);
const unavailable = () => fail(503, 'Layanan akun sementara tidak tersedia. Coba lagi nanti.', 'service_unavailable');

function suppliedToken(request) {
  const token = cookieValue(request, CUSTOMER_COOKIE);
  return /^[A-Za-z0-9_-]{43}$/.test(token || '') ? token : null;
}

export function customerSessionCookie(token, clear = false) {
  return `${CUSTOMER_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_SECONDS}`;
}

export async function loadCustomer(request) {
  const token = suppliedToken(request);
  if (!token) return null;
  try {
    const [rows] = await merchantDb().execute(
      'SELECT c.id,c.email,c.name FROM bridge_customer_sessions s JOIN bridge_customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(6)',
      [hashToken(token)],
    );
    return rows[0] ? { id: rows[0].id, email: rows[0].email, name: rows[0].name } : null;
  } catch { throw unavailable(); }
}

export async function requireCustomer(request) {
  const customer = await loadCustomer(request);
  if (!customer) throw fail(401, 'Masuk ke akun pelanggan untuk melanjutkan.', 'customer_login_required');
  return customer;
}

function validPassword(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 512) throw fail(400, 'Kata sandi harus 12–128 karakter, maksimal 512 byte.', 'invalid_password');
  let length = 0;
  for (const character of value) length++;
  if (length < 12 || length > 128) throw fail(400, 'Kata sandi harus 12–128 karakter, maksimal 512 byte.', 'invalid_password');
  return value;
}

async function rotateSession(db, request, customerId) {
  const previous = suppliedToken(request);
  if (previous) await db.execute('DELETE FROM bridge_customer_sessions WHERE token_hash=?', [hashToken(previous)]);
  const token = randomBytes(32).toString('base64url');
  await db.execute(
    'INSERT INTO bridge_customer_sessions(token_hash,customer_id,created_at,expires_at) VALUES(?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 7 DAY))',
    [hashToken(token), customerId],
  );
  return token;
}

export async function registerCustomer(request, input) {
  if (input?.legalAccepted !== true) throw fail(400, 'Setujui Ketentuan Layanan dan baca Kebijakan Privasi untuk membuat akun.', 'legal_acceptance_required');
  await rateLimit('customer-register-ip:' + clientIp(request), 5, 3600);
  const email = validEmail(input.email);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 200 || [...name].length > 100) throw fail(400, 'Nama harus 1–100 karakter.', 'invalid_name');
  const password = validPassword(input.password);
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt, 32, SCRYPT_OPTIONS);
  const customer = { id: randomUUID(), email, name };
  const db = await merchantDb().getConnection();
  try {
    await db.beginTransaction();
    await db.execute(
      'INSERT INTO bridge_customers(id,email,name,password_salt,password_hash,created_at,legal_accepted_at,legal_document_version) VALUES(?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),?)',
      [customer.id, email, name, salt.toString('hex'), hash.toString('hex'), CUSTOMER_LEGAL_VERSION],
    );
    const token = await rotateSession(db, request, customer.id);
    await db.commit();
    return { customer, token };
  } catch (error) {
    await db.rollback().catch(() => {});
    if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'Akun tidak dapat didaftarkan. Gunakan email lain atau masuk.', 'account_unavailable');
    throw error;
  } finally { db.release(); }
}

export async function loginCustomer(request, input) {
  await rateLimit('customer-login-ip:' + clientIp(request), 10, 900);
  const email = validEmail(input.email);
  await rateLimit('customer-login-email:' + email, 10, 900);
  const password = validPassword(input.password);
  const [rows] = await merchantDb().execute('SELECT id,email,name,password_salt,password_hash FROM bridge_customers WHERE email=?', [email]);
  const row = rows[0];
  if (row && (!/^[a-f0-9]{32}$/.test(row.password_salt) || !/^[a-f0-9]{64}$/.test(row.password_hash))) throw unavailable();
  const expected = row ? Buffer.from(row.password_hash, 'hex') : DUMMY_HASH;
  const actual = await derivePassword(password, row ? Buffer.from(row.password_salt, 'hex') : DUMMY_SALT, 32, SCRYPT_OPTIONS);
  const matches = timingSafeEqual(actual, expected);
  if (!row || !matches) throw fail(401, 'Email atau kata sandi tidak sesuai.', 'invalid_credentials');
  const customer = { id: row.id, email: row.email, name: row.name };
  const db = await merchantDb().getConnection();
  try {
    await db.beginTransaction();
    const token = await rotateSession(db, request, customer.id);
    await db.commit();
    return { customer, token };
  } catch (error) {
    await db.rollback().catch(() => {});
    throw error;
  } finally { db.release(); }
}

export async function logoutCustomer(request) {
  const token = suppliedToken(request);
  if (token) await merchantDb().execute('DELETE FROM bridge_customer_sessions WHERE token_hash=?', [hashToken(token)]);
}
