import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

// Exercise the real overview and SQL; only external commerce/catalog services are replaced.
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE apiKeys (id TEXT,key TEXT,name TEXT,isActive INTEGER,createdAt TEXT,tokenLimit INTEGER,tokensUsed INTEGER,rpmLimit INTEGER,tpmLimit INTEGER,expiresAt TEXT,allowedModels TEXT,blockedModels TEXT);
CREATE TABLE usageHistory (apiKey TEXT,timestamp TEXT,promptTokens INTEGER,completionTokens INTEGER);
INSERT INTO apiKeys VALUES ('a1','secret-a1','A',1,'2026-01-01',1000,0,0,0,NULL,NULL,NULL),('a2','secret-a2','A2',1,'2026-01-01',1000,0,0,0,NULL,NULL,NULL),('b','secret-b','B',1,'2026-01-01',1000,0,0,0,NULL,NULL,NULL);`);
const now = Date.parse('2026-03-10T12:34:56.789Z');
const insert = db.prepare('INSERT INTO usageHistory VALUES (?,?,?,?)');
for (const row of [
  ['secret-a1','2026-02-08T23:59:59.999Z',900,900],
  ['secret-a1','2026-02-09T00:00:00.000Z',10,2],
  ['secret-a2','2026-02-09T23:59:59.999Z',20,3],
  ['secret-a1','2026-02-10T00:00:00.000Z',30,4],
  ['secret-a1','2026-02-10T01:00:00.000+02:00',40,5],
  ['secret-a1','2026-03-10T12:34:56.789Z',50,6],
  ['secret-a1','2026-03-10T12:34:56.790Z',900,900],
  ['secret-a1','2026-03-11T00:00:00.000Z',900,900],
  ['secret-b','2026-02-09T00:00:00.000Z',700,80],
  ['unknown','2026-02-09T00:00:00.000Z',900,900],
]) insert.run(...row);
const merchant = { async execute(sql, [id]) {
  if (sql.startsWith('SELECT DISTINCT api_key_id')) return [(id === 'a' ? ['a1','a2'] : id === 'b' ? ['b'] : []).map(api_key_id => ({ api_key_id }))];
  assert.match(sql, /FROM bridge_checkout WHERE customer_id=\?$/);
  return [[{ total: 2, paid: 1, pending: 1 }]];
} };
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const context = createContext({ Date: Clock, console, fetch });
const dependencies = {
  'node:crypto': { randomUUID() {} },
  'node:perf_hooks': { performance: {} },
  './merchant-commerce.mjs': { routerDb: () => db },
  './merchant-store.mjs': { merchantDb: () => merchant, rateLimit() {} },
  './merchant-http.mjs': { boundedText() {}, fail() {}, PUBLIC_ORIGIN: 'https://example.test' },
  './site-catalog.mjs': { getSiteCatalog() {} },
  './model-policy.cjs': { default: { policyAllowsModel() {} } },
};
const module = new SourceTextModule(await readFile(new URL('./lib/customer-dashboard.mjs', import.meta.url), 'utf8'), { context });
await module.link(specifier => {
  const exports = dependencies[specifier];
  assert.ok(exports, `Unexpected dependency: ${specifier}`);
  return new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await module.evaluate();
const overview = async id => JSON.parse(JSON.stringify(await module.namespace.customerOverview({ id })));
try {
  const a = await overview('a');
  assert.equal(a.window.days, 30);
  assert.equal(a.window.since, '2026-02-09T00:00:00.000Z');
  assert.equal(a.activity.length, 30);
  for (let i = 0; i < 30; i++) assert.equal(a.activity[i].date, new Date(Date.parse(a.window.since) + i * 86400000).toISOString().slice(0, 10));
  assert.deepEqual(a.activity[0], { date: '2026-02-09', requests: 3, promptTokens: 70, completionTokens: 10, totalTokens: 80 });
  assert.deepEqual(a.activity[1], { date: '2026-02-10', requests: 1, promptTokens: 30, completionTokens: 4, totalTokens: 34 });
  assert.deepEqual(a.activity[29], { date: '2026-03-10', requests: 1, promptTokens: 50, completionTokens: 6, totalTokens: 56 });
  assert.ok(a.activity.slice(2, 29).every(day => day.requests === 0 && day.totalTokens === 0 && day.promptTokens === 0 && day.completionTokens === 0));
  assert.deepEqual(a.usage, { requests: 5, promptTokens: 150, completionTokens: 20, totalTokens: 170 });
  assert.deepEqual(a.keys, { total: 2, active: 2, remainingTokens: 2000 });
  assert.deepEqual(a.orders, { total: 2, paid: 1, pending: 1 });
  const b = await overview('b');
  assert.deepEqual(b.usage, { requests: 1, promptTokens: 700, completionTokens: 80, totalTokens: 780 });
  assert.equal(b.activity[0].requests, 1);
  const empty = await overview('empty');
  assert.equal(empty.activity.length, 30);
  assert.ok(empty.activity.every(day => day.requests === 0 && day.promptTokens === 0 && day.completionTokens === 0 && day.totalTokens === 0));
  assert.deepEqual(empty.usage, { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  console.log('Customer activity: UTC boundaries, 30 zero-filled days, matching totals, owned-key account isolation: PASS');
} finally { db.close(); }
