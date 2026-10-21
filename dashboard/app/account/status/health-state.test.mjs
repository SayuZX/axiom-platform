import assert from 'node:assert/strict';
import { serviceState, summaryState } from './health-state.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

assert.equal(serviceState({ available: true, latencyMs: 0 }), 'healthy');
assert.equal(serviceState({ available: true, latencyMs: 999 }), 'healthy');
assert.equal(serviceState({ available: true, latencyMs: 1000 }), 'slow');
assert.equal(serviceState({ available: true, latencyMs: 1001 }), 'slow');
assert.equal(serviceState({ available: false, latencyMs: null }), 'down');
assert.equal(serviceState({ available: false, latencyMs: 50 }), 'down');
for (const latencyMs of [null, undefined, NaN, Infinity, -1, '10']) {
  assert.equal(serviceState({ available: true, latencyMs }), 'unknown');
}
assert.equal(serviceState({ latencyMs: 10 }), 'unknown');
assert.equal(serviceState(null), 'unknown');
assert.equal(serviceState({ available: true, latencyMs: 10 }, true), 'unknown');
assert.equal(summaryState([]), 'unknown');
assert.equal(summaryState(['healthy', 'healthy']), 'healthy');
assert.equal(summaryState(['healthy', 'slow']), 'slow');
assert.equal(summaryState(['healthy', 'unknown']), 'unknown');
assert.equal(summaryState(['slow', 'unknown']), 'unknown');
assert.equal(summaryState(['unknown', 'down']), 'down');
assert.equal(summaryState(['healthy'], true), 'down');
assert.equal(summaryState([], true), 'down');
assert.equal(summaryState(['unknown'], true), 'down');
assert.equal(summaryState(['healthy'], false), 'healthy');
assert.equal(summaryState(['healthy'], null), 'unknown');

// Exercise the real proxy with isolated settings; never write production maintenance state.
const proxySource = readFileSync(new URL('../../../proxy.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/export /g, '');
for (const enabled of [false, true]) {
  const context = vm.createContext({
    readMaintenance: () => ({ enabled, message: 'Fixture maintenance', retryAfter: 60 }),
    NextResponse: { next: () => ({ action: 'next' }), redirect: (url, options) => ({ action: 'redirect', url, ...options }), json: (body, options) => ({ body, ...options }) },
  });
  vm.runInContext(proxySource, context);
  const request = (pathname, method = 'GET') => ({ method, nextUrl: { pathname, clone: () => new URL('https://example.test' + pathname) } });
  for (const path of ['/account', '/account/status', '/account/login', '/account-api/login', '/customer-api/status', '/wallet-api/balance', '/login', '/logout']) {
    for (const method of ['GET', 'POST']) assert.equal((await context.proxy(request(path, method))).action, 'next', `${enabled}: ${method} ${path}`);
  }
  // Native routes retain their own authentication / inference maintenance gates.
  for (const path of ['/manage-api/maintenance', '/api/chat/completions', '/v1/chat/completions', '/v1beta/models']) assert.equal((await context.proxy(request(path, 'POST'))).action, 'next');
  for (const path of ['/', '/pricing', '/account-other', '/customer-api-other']) {
    const result = await context.proxy(request(path));
    assert.equal(result.action, enabled ? 'redirect' : 'next');
    if (enabled) { assert.equal(result.status, 307); assert.equal(result.url.pathname, '/maintenance'); }
  }
  assert.equal((await context.proxy(request('/pricing', 'POST'))).status, enabled ? 503 : undefined);
}

const db = new DatabaseSync(':memory:');
try {
  db.exec(`CREATE TABLE apiKeys (id TEXT,packageId TEXT,customerEmail TEXT);
    CREATE TABLE axiom_notices (notice_id TEXT,enabled INTEGER,mode TEXT,target TEXT,target_group TEXT,event_type TEXT,priority INTEGER,start_at INTEGER,expires_at INTEGER,title TEXT,message TEXT);
    CREATE TABLE axiom_notice_receipts (notice_id TEXT,api_key_id TEXT,claimed_at INTEGER);
    INSERT INTO apiKeys VALUES ('owned','starter','owner@example.test'),('other','private','other@example.test');
    INSERT INTO axiom_notice_receipts VALUES ('mine','owned',1);`);
  const insert = db.prepare('INSERT INTO axiom_notices VALUES (?,1,?,?,?,?,0,?,?,?,?)');
  for (const [id, target, group] of [['global','all',null],['mine','group','key:owned'],['package','group','starter'],['email','group','owner@example.test'],['foreign','group','key:other'],['foreign-email','group','other@example.test']]) {
    insert.run(id, 'once_per_notice', target, group, 'INFO', null, null, id, 'Public announcement');
  }
  insert.run('retail-price', 'always', 'all', null, 'PRICING', null, null, 'Pembaruan tarif jual AXIOM', 'Tarif jual terbaru');
  insert.run('future', 'always', 'all', null, 'INFO', Date.now() + 86400000, null, 'Future', 'Not yet');
  insert.run('expired', 'always', 'all', null, 'INFO', null, 1, 'Expired', 'Ended');
  insert.run('disabled', 'disabled', 'all', null, 'INFO', null, null, 'Disabled', 'Hidden');
  const source = readFileSync(new URL('../../../lib/customer-dashboard.mjs', import.meta.url), 'utf8');
  const statusSource = source.slice(source.indexOf('export async function customerStatus(')).replace('export ', '');
  const context = vm.createContext({
    ownedIds: async customer => JSON.stringify(customer.id === 'owner' ? ['owned'] : []), routerDb: () => db,
    performance: { now: () => 1 }, AbortSignal, Date,
    fetch: async url => ({ ok: true, status: 200, body: url.includes('3082') ? 'OK' : '{"ok":true}' }),
    boundedText: async response => response.body,
  });
  vm.runInContext(statusSource, context);
  const result = await context.customerStatus({ id: 'owner' });
  assert.deepEqual(Array.from(result.notices, notice => notice.id), ['email','global','mine','package']);
  assert.deepEqual(Object.keys(result.notices[0]).sort(), ['eventType','expiresAt','id','message','progress','startAt','title']);
  assert.equal(result.notices[0].progress, null);
  assert.deepEqual(Array.from((await context.customerStatus({ id: 'no-keys' })).notices, notice => notice.id), ['global']);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM axiom_notice_receipts').get().count, 1);
} finally { db.close(); }
console.log('Health state boundaries passed.');
