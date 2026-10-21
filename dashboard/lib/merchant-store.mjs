import mysql from 'mysql2/promise';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

let pool;
export function merchantDb() {
  if (!process.env.MERCHANT_DATABASE_URL) throw Object.assign(new Error('Database merchant belum dikonfigurasi.'), { status: 503, code: 'configuration_required' });
  pool ??= mysql.createPool({ uri: process.env.MERCHANT_DATABASE_URL, connectionLimit: 8, timezone: 'Z', dateStrings: true, enableKeepAlive: true, connectTimeout: 5000 });
  return pool;
}
function encryptionKey() {
  const key = process.env.MERCHANT_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw Object.assign(new Error('Enkripsi merchant belum dikonfigurasi.'), { status: 503, code: 'configuration_required' });
  return Buffer.from(key, 'hex');
}
export const hashToken = value => createHash('sha256').update(value).digest('hex');
export function seal(value) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function unseal(value) {
  const data = Buffer.from(value, 'base64');
  if (data.length < 29) throw new Error('Invalid protected state');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
}
export async function createSession(payload) {
  const token = randomBytes(32).toString('base64url');
  await merchantDb().execute('INSERT INTO bridge_sessions(token_hash,payload_encrypted,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 30 MINUTE))', [hashToken(token), seal(payload)]);
  return token;
}
export async function loadSession(token, connection = merchantDb(), lock = false) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null;
  const [rows] = await connection.execute('SELECT payload_encrypted FROM bridge_sessions WHERE token_hash=? AND expires_at>UTC_TIMESTAMP(6)' + (lock ? ' FOR UPDATE' : ''), [hashToken(token)]);
  return rows[0] ? unseal(rows[0].payload_encrypted) : null;
}
export async function saveSession(token, data, connection = merchantDb()) {
  await connection.execute('UPDATE bridge_sessions SET payload_encrypted=?, expires_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 12 HOUR),updated_at=UTC_TIMESTAMP(6) WHERE token_hash=?', [seal(data), hashToken(token)]);
}
export async function deleteSession(token) {
  if (token) await merchantDb().execute('DELETE FROM bridge_sessions WHERE token_hash=?', [hashToken(token)]);
}
export async function setting(name) {
  const [rows] = await merchantDb().execute('SELECT value_encrypted FROM bridge_settings WHERE name=?', [name]);
  return rows[0] ? unseal(rows[0].value_encrypted) : null;
}
export async function saveSetting(name, value) {
  await merchantDb().execute('INSERT INTO bridge_settings(name,value_encrypted) VALUES(?,?) ON DUPLICATE KEY UPDATE value_encrypted=VALUES(value_encrypted),updated_at=UTC_TIMESTAMP(6)', [name, seal(value)]);
}
export async function rateLimit(key, maximum, seconds) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const id = hashToken(`${key}:${bucket}`);
  await merchantDb().execute('INSERT INTO bridge_rate_limits(bucket_key,hits,expires_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE hits=hits+1', [id, seconds * 2]);
  const [[row]] = await merchantDb().execute('SELECT hits FROM bridge_rate_limits WHERE bucket_key=?', [id]);
  if (row.hits > maximum) throw Object.assign(new Error('Terlalu banyak permintaan. Coba lagi nanti.'), { status: 429, code: 'rate_limited' });
}
