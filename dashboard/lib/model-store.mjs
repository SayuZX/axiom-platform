import { randomUUID } from 'node:crypto';
import { routerDb } from './merchant-commerce.mjs';
import { fail } from './merchant-http.mjs';

const own = (value, key) => Object.hasOwn(value, key) ? value[key] : undefined;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const priceFields = ['input', 'output', 'cached', 'reasoning', 'cache_creation'];
const modelFields = ['provider', 'modelId', 'displayName', 'description', 'category', 'badge', 'contextWindow', 'maxOutput', 'capabilities', 'isActive', 'isPopular', 'sortOrder'];
const capabilityFields = ['vision', 'reasoning', 'search', 'tools'];
function invalid(message) { throw fail(400, message, 'invalid_model'); }
function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) invalid(`${label} tidak valid.`);
  return value.trim();
}
function identifier(value, label = 'ID model') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/@+~-]{0,299}$/.test(value) || value.includes('://') || value.split('/').some(part => !part || ['.', '..', '__proto__', 'prototype', 'constructor'].includes(part))) invalid(`${label} tidak valid.`);
  return value;
}
function recordId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) invalid('ID showcase tidak valid.');
  return id;
}
function limit(value, label) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) invalid(`${label} harus bilangan bulat positif atau kosong.`);
  return value;
}
function decode(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!object(parsed)) throw fail(503, 'Konfigurasi model router tidak valid.', 'model_configuration');
  return parsed;
}
function view(row) {
  return { ...row, capabilities: row.capabilities ? decode(row.capabilities) : {}, isActive: row.isActive === 1, isPopular: row.isPopular === 1 };
}
export function showcaseRecords() {
  // Native GET seeds examples when empty. Read the existing table without that side effect.
  return routerDb().prepare('SELECT * FROM showcaseModels ORDER BY sortOrder,createdAt,id').all().map(view);
}
export function matchShowcase(record, liveModels) {
  return liveModels.find(model => model.id === record.modelId) ?? liveModels.find(model => model.id === `${record.provider}/${record.modelId}`) ?? null;
}
export function priceIdentity(model) {
  const slash = model.id.indexOf('/');
  return { provider: slash < 0 ? model.provider : model.id.slice(0, slash), model: slash < 0 ? model.id : model.id.slice(slash + 1) };
}
export function configuredPricing() {
  return new Map(routerDb().prepare("SELECT key,value FROM kv WHERE scope='pricing'").all().map(row => [row.key, decode(row.value)]));
}
export function modelPricing(model, prices) {
  const identity = priceIdentity(model);
  const provider = prices.get(identity.provider);
  const value = provider && own(provider, identity.model);
  const row = object(value) ? value : {};
  const price = field => typeof own(row, field) === 'number' && Number.isFinite(row[field]) && row[field] >= 0 ? row[field] : null;
  const result = { inputPrice: price('input'), outputPrice: price('output'), cachedPrice: price('cached'), reasoningPrice: price('reasoning'), cacheCreationPrice: price('cache_creation') };
  return { ...result, currency: 'USD', priceUnit: 'million_tokens', pricingSource: Object.values(result).some(value => value !== null) ? 'native-admin' : null };
}
export function saveShowcase(input, liveModels, id = null) {
  if (!object(input) || !Object.keys(input).length || Object.keys(input).some(key => !modelFields.includes(key))) invalid('Pengaturan showcase tidak valid. Harga diatur melalui Model Pricing.');
  const db = routerDb();
  const existing = id ? db.prepare('SELECT * FROM showcaseModels WHERE id=?').get(recordId(id)) : null;
  if (id && !existing) throw fail(404, 'Showcase tidak ditemukan.', 'not_found');
  const previous = existing ? view(existing) : null;
  const next = { provider: '', modelId: '', displayName: '', description: '', category: 'Chat', badge: '', contextWindow: null, maxOutput: null, capabilities: {}, isActive: true, isPopular: false, sortOrder: 0, ...previous, ...input };
  for (const key of ['provider', 'modelId']) if (!previous || Object.hasOwn(input, key)) next[key] = identifier(next[key], key);
  if (next.provider.includes('/')) invalid('Provider tidak boleh mengandung garis miring.');
  for (const [key, label, max, required] of [['displayName', 'Nama tampilan', 160, true], ['description', 'Deskripsi', 3000, false], ['category', 'Kategori', 80, true], ['badge', 'Label', 80, false]]) {
    if (!previous || Object.hasOwn(input, key)) next[key] = text(next[key], label, max, required);
  }
  for (const key of ['contextWindow', 'maxOutput']) if (!previous || Object.hasOwn(input, key)) next[key] = limit(next[key], key);
  if ((Object.hasOwn(input, 'contextWindow') || Object.hasOwn(input, 'maxOutput')) && next.contextWindow && next.maxOutput && next.maxOutput > next.contextWindow) invalid('Batas output tidak boleh melebihi jendela konteks.');
  for (const key of ['isActive', 'isPopular']) if (typeof next[key] !== 'boolean') invalid(`${key} harus boolean.`);
  if (!Number.isSafeInteger(next.sortOrder) || next.sortOrder < 0 || next.sortOrder > 1000000) invalid('Urutan harus bilangan bulat 0–1.000.000.');
  if (Object.hasOwn(input, 'capabilities')) {
    if (!object(input.capabilities) || Object.entries(input.capabilities).some(([key, value]) => !capabilityFields.includes(key) || typeof value !== 'boolean')) invalid('Kapabilitas model tidak valid.');
    next.capabilities = { ...previous?.capabilities, ...input.capabilities };
  }
  const matched = matchShowcase(next, liveModels);
  const changedIdentity = !previous || next.provider !== previous.provider || next.modelId !== previous.modelId;
  if (!matched && (changedIdentity || (input.isActive === true && !previous?.isActive))) throw fail(409, 'Pilih ID persis dari katalog model terhubung. Rekaman lama yang tidak cocok tidak dipublikasikan.', 'model_not_connected');
  if (matched && changedIdentity && showcaseRecords().some(row => row.id !== id && matchShowcase(row, liveModels)?.id === matched.id)) throw fail(409, 'Model ini sudah memiliki rekaman showcase. Edit rekaman tersebut.', 'duplicate_showcase');
  const now = new Date().toISOString();
  const columns = modelFields;
  const values = columns.map(key => key === 'capabilities' ? JSON.stringify(next[key]) : ['isActive', 'isPopular'].includes(key) ? +next[key] : next[key]);
  if (id) {
    db.prepare(`UPDATE showcaseModels SET ${columns.map(key => `${key}=?`).join(',')},updatedAt=? WHERE id=?`).run(...values, now, id);
  } else {
    id = randomUUID();
    // Legacy tariff columns remain nullable, never another authoritative price store.
    db.prepare(`INSERT INTO showcaseModels(${columns.join(',')},id,createdAt,updatedAt,inputPrice,outputPrice,cachedPrice,reasoningPrice) VALUES(${columns.map(() => '?').join(',')},?,?,?,NULL,NULL,NULL,NULL)`).run(...values, id, now, now);
  }
  return { model: view(db.prepare('SELECT * FROM showcaseModels WHERE id=?').get(id)) };
}
export function deleteShowcase(id) {
  if (!routerDb().prepare('DELETE FROM showcaseModels WHERE id=?').run(recordId(id)).changes) throw fail(404, 'Showcase tidak ditemukan.', 'not_found');
  return { ok: true };
}
export function saveModelPricing(input, liveModels) {
  if (!object(input) || Object.keys(input).some(key => key !== 'id' && !priceFields.includes(key)) || !priceFields.some(key => Object.hasOwn(input, key))) invalid('Pengaturan harga tidak valid.');
  identifier(input.id);
  const live = liveModels.find(model => model.id === input.id);
  if (!live) throw fail(409, 'Model tidak terhubung. Muat ulang katalog sebelum mengubah harga.', 'model_not_connected');
  const identity = priceIdentity(live);
  identifier(identity.provider, 'Provider'); identifier(identity.model);
  for (const field of priceFields) if (Object.hasOwn(input, field) && input[field] !== null && (typeof input[field] !== 'number' || !Number.isFinite(input[field]) || input[field] < 0 || input[field] > 1000000)) invalid('Harga harus angka USD 0–1.000.000 per juta token, atau kosong.');
  const db = routerDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare("SELECT value FROM kv WHERE scope='pricing' AND key=?").get(identity.provider);
    const provider = current ? decode(current.value) : {};
    const stored = own(provider, identity.model);
    if (stored !== undefined && !object(stored)) throw fail(409, 'Konfigurasi harga native tidak valid; perubahan dibatalkan.', 'pricing_configuration');
    const next = { ...stored };
    for (const field of priceFields) if (Object.hasOwn(input, field)) {
      if (input[field] === null) delete next[field]; else next[field] = input[field];
    }
    // Native PATCH replaces an entire model. Merge under a write lock to retain unknown fields and concurrent updates.
    if (Object.keys(next).length) provider[identity.model] = next; else delete provider[identity.model];
    if (Object.keys(provider).length) db.prepare("INSERT INTO kv(scope,key,value) VALUES('pricing',?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value").run(identity.provider, JSON.stringify(provider));
    else db.prepare("DELETE FROM kv WHERE scope='pricing' AND key=?").run(identity.provider);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { ok: true, id: live.id };
}
