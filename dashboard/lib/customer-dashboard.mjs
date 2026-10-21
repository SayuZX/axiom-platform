import { performance } from 'node:perf_hooks';
import { routerDb } from './merchant-commerce.mjs';
import { merchantDb, rateLimit } from './merchant-store.mjs';
import { boundedText, fail } from './merchant-http.mjs';
import { getSiteCatalog } from './site-catalog.mjs';
import { ledgerRecords, usageTotals } from './customer-usage.mjs';

const WINDOW_DAYS = 30;
const keyColumns = 'id,name,isActive,createdAt,tokenLimit,tokensUsed,rpmLimit,tpmLimit,expiresAt,allowedModels,blockedModels';
const parse = value => value == null ? null : typeof value === 'string' ? JSON.parse(value) : value;

async function ownedIds(customer) {
  const [rows] = await merchantDb().execute('SELECT DISTINCT api_key_id FROM bridge_checkout WHERE customer_id=? AND api_key_id IS NOT NULL', [customer.id]);
  return JSON.stringify(rows.map(row => row.api_key_id));
}
function keyView(row) {
  const expired = Boolean(row.expiresAt && Date.parse(row.expiresAt) <= Date.now());
  const exhausted = row.tokenLimit > 0 && row.tokensUsed >= row.tokenLimit;
  return { ...row, isActive: Boolean(row.isActive), allowedModels: parse(row.allowedModels), blockedModels: parse(row.blockedModels), expired, exhausted, usable: Boolean(row.isActive) && !expired && !exhausted, remainingTokens: row.tokenLimit > 0 ? Math.max(0, row.tokenLimit - row.tokensUsed) : null };
}
export async function customerKeys(customer) {
  const ids = await ownedIds(customer);
  return { keys: routerDb().prepare(`SELECT ${keyColumns} FROM apiKeys WHERE id IN (SELECT value FROM json_each(?)) ORDER BY createdAt DESC,id`).all(ids).map(keyView) };
}
async function ownedKey(customer, id, secret = false) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw fail(404, 'Kunci tidak ditemukan.', 'not_found');
  const [rows] = await merchantDb().execute('SELECT api_key_id FROM bridge_checkout WHERE customer_id=? AND api_key_id=? LIMIT 1', [customer.id, id]);
  if (!rows.length) throw fail(404, 'Kunci tidak ditemukan.', 'not_found');
  const row = routerDb().prepare(`SELECT ${keyColumns}${secret ? ',key' : ''} FROM apiKeys WHERE id=?`).get(id);
  if (!row) throw fail(404, 'Kunci tidak ditemukan.', 'not_found');
  return row;
}
export async function revealCustomerKey(customer, id) {
  await rateLimit('customer-key-reveal:' + customer.id, 30, 60);
  const row = await ownedKey(customer, id, true);
  return { id: row.id, key: row.key };
}
export async function updateCustomerKey(customer, id, input) {
  await ownedKey(customer, id);
  const fields = Object.keys(input);
  if (!fields.length || fields.some(field => !['name', 'isActive'].includes(field))) throw fail(400, 'Hanya nama dan pencabutan kunci yang dapat diubah.', 'invalid_key');
  const changes = [], values = [];
  if ('name' in input) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 160) throw fail(400, 'Nama kunci harus 1–160 karakter.', 'invalid_key');
    changes.push('name=?'); values.push(input.name.trim());
  }
  if ('isActive' in input) {
    if (input.isActive !== false) throw fail(400, 'Kunci yang dicabut tidak dapat diaktifkan melalui halaman ini.', 'invalid_key');
    changes.push('isActive=?'); values.push(0);
  }
  routerDb().prepare(`UPDATE apiKeys SET ${changes.join(',')} WHERE id=?`).run(...values, id);
  return { key: keyView(await ownedKey(customer, id)) };
}

function modelDetails(row, catalog) {
  const match = catalog.models.find(model => model.id === row.model || model.id === `${row.provider}/${row.model}`);
  return { model: row.model || 'unknown', provider: row.provider || null, modelLabel: match?.name || row.model || 'Model tidak diketahui', catalogModelId: match?.id || null };
}
export async function customerOverview(customer) {
  const [keys, keyIds] = await Promise.all([customerKeys(customer), ownedIds(customer)]);
  const db = routerDb(), end = new Date(), startDate = new Date(end);
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() - WINDOW_DAYS + 1);
  const start = startDate.toISOString(), args = [keyIds, startDate.getTime(), end.getTime()];
  const scoped = `${ledgerRecords} SELECT ${usageTotals} FROM records WHERE sortTime>=? AND sortTime<=?`;
  const usage = db.prepare(scoped).get(...args);
  const rows = db.prepare(`${ledgerRecords} SELECT date(timestamp) date,${usageTotals} FROM records WHERE sortTime>=? AND sortTime<=? GROUP BY date(timestamp) ORDER BY date(timestamp)`).all(...args);
  const daily = new Map(rows.map(row => [row.date, row]));
  const activity = Array.from({ length: WINDOW_DAYS }, (_, index) => {
    const date = new Date(startDate.getTime() + index * 86400000).toISOString().slice(0, 10);
    return daily.get(date) || { date, requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, debitTokens: 0, saleCostIdr: null, unavailableUsageRequests: 0, provisionalRequests: 0, usageCompleteness: 'empty' };
  });
  const [[orders]] = await merchantDb().execute("SELECT COUNT(*) total,SUM(state='settlement') paid,SUM(state IN ('creating','unknown','pending')) pending FROM bridge_checkout WHERE customer_id=?", [customer.id]);
  return { usage, activity, checkedAt: end.toISOString(), lastUpdatedAt: usage.lastUpdatedAt == null ? null : new Date(usage.lastUpdatedAt).toISOString(), source: 'ledger', keys: { total: keys.keys.length, active: keys.keys.filter(key => key.usable).length, remainingTokens: keys.keys.filter(key => key.usable).reduce((sum, key) => sum + (key.remainingTokens || 0), 0) }, orders: { total: Number(orders.total), paid: Number(orders.paid || 0), pending: Number(orders.pending || 0) }, window: { days: WINDOW_DAYS, since: start }, note: 'Ringkasan, per model, dan riwayat memakai ledger permintaan yang sama. Data router lama tidak digabung karena tidak memiliki ID permintaan bersama. Tidak tersedia berarti sumber belum melaporkan angka; biaya bukan estimasi tarif katalog.' };
}
export async function customerLogs(customer, search) {
  const requestedPage = Number(search.get('page') || 1), status = search.get('status') || '', model = search.get('model') || '';
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 100000 || !['', 'success', 'error', 'started', 'streaming', 'completed', 'incomplete', 'failed'].includes(status) || model.length > 300 || !['', 'ledger'].includes(search.get('source') || '')) throw fail(400, 'Filter log tidak valid.', 'invalid_filter');
  const keyIds = await ownedIds(customer), db = routerDb(), size = 25;
  const filters = [], args = [keyIds];
  if (status) {
    filters.push(status === 'success' ? "status='completed'" : status === 'error' ? "status IN ('failed','incomplete')" : 'status=?');
    if (!['success', 'error'].includes(status)) args.push(status);
  }
  if (model) { filters.push('model=?'); args.push(model); }
  const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
  const summary = db.prepare(`${ledgerRecords} SELECT COUNT(*) total,MAX(updatedAt) lastUpdatedAt FROM records${where}`).get(...args);
  const total = summary.total, totalPages = Math.max(1, Math.ceil(total / size)), page = Math.min(requestedPage, totalPages);
  const rows = db.prepare(`${ledgerRecords} SELECT * FROM records${where} ORDER BY sortTime DESC,id DESC LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size);
  const catalog = await getSiteCatalog();
  return { logs: rows.map(row => ({ ...row, ...modelDetails(row, catalog) })), page, pageSize: size, total, totalPages, checkedAt: new Date().toISOString(), lastUpdatedAt: summary.lastUpdatedAt == null ? null : new Date(summary.lastUpdatedAt).toISOString(), source: 'ledger', retentionNote: 'Satu baris per permintaan ledger. Log router lama tidak digabung. Durasi hanya tersedia dari waktu mulai dan selesai yang tercatat. Tanda — berarti data belum tersedia; biaya tidak ditaksir.' };
}
export async function customerPerformance(customer) {
  const keyIds = await ownedIds(customer), end = new Date(), startDate = new Date(end);
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() - WINDOW_DAYS + 1);
  const start = startDate.toISOString();
  const usage = routerDb().prepare(`${ledgerRecords} SELECT model,provider,${usageTotals} FROM records WHERE sortTime>=? AND sortTime<=? GROUP BY model,provider ORDER BY requests DESC`).all(keyIds, startDate.getTime(), end.getTime());
  const catalog = await getSiteCatalog();
  const lastUpdated = usage.reduce((latest, row) => Math.max(latest, row.lastUpdatedAt || 0), 0);
  return { window: { days: WINDOW_DAYS, since: start }, checkedAt: end.toISOString(), lastUpdatedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null, usage: usage.map(row => ({ ...row, ...modelDetails(row, catalog), outputTps: null, reason: 'Durasi permintaan bukan durasi generasi token; TPS tidak tersedia.' })), source: 'Ledger permintaan milik akun; sumber sama dengan ringkasan dan riwayat. Biaya kosong tidak ditaksir dari katalog.' };
}
export async function customerStatus(customer) {
  const ids = await ownedIds(customer), db = routerDb(), now = Date.now();
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('axiom_announcement_details','axiom_announcement_progress')").all().map(row => row.name));
  const details = tables.has('axiom_announcement_details'), progress = details && tables.has('axiom_announcement_progress');
  const notices = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='axiom_notices'").get()
    ? db.prepare(`SELECT n.notice_id AS id,n.event_type AS eventType,n.title,n.message,n.start_at AS startAt,n.expires_at AS expiresAt,
          ${progress ? 'p.stage,p.updated_at AS progressUpdatedAt' : 'NULL AS stage,NULL AS progressUpdatedAt'}
        FROM axiom_notices n
        ${details ? 'LEFT JOIN axiom_announcement_details d ON d.id=n.notice_id' : ''}
        ${progress ? 'LEFT JOIN axiom_announcement_progress p ON p.id=d.id' : ''}
        WHERE n.enabled=1 AND (n.mode IN ('always','once_per_notice')${progress ? ' OR p.stage IS NOT NULL' : ''}) AND n.event_type!='PRICING'
          ${details ? "AND (d.id IS NULL OR (d.category!='PRICING' AND d.audience IN ('public','customers') AND d.published_at<=?))" : ''}
          AND (n.start_at IS NULL OR n.start_at<=?) AND (n.expires_at IS NULL OR n.expires_at>?)
          AND (n.target='all' OR (n.target='group' AND EXISTS (
            SELECT 1 FROM apiKeys k WHERE k.id IN (SELECT value FROM json_each(?))
              AND (n.target_group='key:'||k.id OR n.target_group=k.packageId OR n.target_group=k.customerEmail)
          )))
        ORDER BY n.priority DESC,n.notice_id ASC`).all(...(details ? [now, now, now, ids] : [now, now, ids])).map(({stage, progressUpdatedAt, ...notice}) => ({...notice, progress: stage ? {stage, updatedAt: new Date(progressUpdatedAt).toISOString()} : null}))
    : [];
  // The status inbox shows current applicable notices even if an API header was already sent.
  // Reading it never claims or resets once_per_notice delivery receipts.
  const targets = [{ id: 'router', name: 'Router API', url: 'http://127.0.0.1:20128/api/health' }, { id: 'merchant', name: 'Layanan pembayaran', url: 'http://127.0.0.1:3082/health' }];
  const services = await Promise.all(targets.map(async target => {
    const started = performance.now();
    try {
      const response = await fetch(target.url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
      const body = await boundedText(response, 65536);
      const healthy = response.ok && (target.id === 'merchant' ? body.trim() === 'OK' : JSON.parse(body).ok === true);
      return { id: target.id, name: target.name, available: healthy, status: response.status, latencyMs: Math.round(performance.now() - started), message: healthy ? 'Endpoint kesehatan merespons.' : 'Endpoint kesehatan mengembalikan kesalahan.' };
    } catch { return { id: target.id, name: target.name, available: false, status: null, latencyMs: null, message: 'Endpoint kesehatan tidak dapat dijangkau dalam 5 detik.' }; }
  }));
  return { checkedAt: new Date().toISOString(), services, notices, note: 'Pemeriksaan langsung layanan lokal, bukan jaminan seluruh model/provider tersedia. Tidak melakukan inferensi atau transaksi pembayaran.' };
}
