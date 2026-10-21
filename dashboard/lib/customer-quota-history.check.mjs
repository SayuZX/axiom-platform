import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Run with Node 24: node lib/customer-quota-history.check.mjs. No production connections.
const db = new DatabaseSync(':memory:');
const merchant = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE apiKeys(id TEXT PRIMARY KEY,key TEXT,name TEXT,packageId TEXT,tokenLimit INTEGER,tokensUsed INTEGER);
CREATE TABLE tokenPackages(id TEXT PRIMARY KEY,name TEXT);
INSERT INTO tokenPackages VALUES ('p','Original package');
INSERT INTO apiKeys VALUES ('mine','sk-private-1234','Primary','p',100,100),('other','sk-private-5678','Private','p',10,10),('unlimited','sk-private-9999','Unlimited','p',0,999),('nullable','sk-private-0000','Nullable','p',NULL,999);`);
merchant.exec(`CREATE TABLE bridge_checkout(customer_id TEXT,api_key_id TEXT);
INSERT INTO bridge_checkout VALUES ('alice','mine'),('alice','mine'),('bob','other');`);
const source = readFileSync(new URL('./customer-quota-history.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const { installQuotaHistory, customerQuotaHistory } = new Function('routerDb', 'merchantDb', 'fail', `${source}\nreturn { installQuotaHistory, customerQuotaHistory };`)(
  () => db,
  () => ({ execute: async (sql, args) => [merchant.prepare(sql).all(...args)] }),
  (status, message) => Object.assign(new Error(message), { status }),
);
const load = (query = '', id = 'alice') => customerQuotaHistory({ id }, new URLSearchParams(query));
try {
  installQuotaHistory(db);
  installQuotaHistory(db);
  let result = await load();
  const reinstall = () => new Function('routerDb', 'merchantDb', 'fail', `${source}\nreturn installQuotaHistory;`)(null, null, null)(db);
  reinstall();
  assert.equal(result.total, 1, 'Seed once; duplicate purchases do not duplicate events');
  assert.equal(result.events[0].exhaustedAt, null, 'Existing exhaustion time unknown');
  assert.ok(Date.parse(result.events[0].recordedAt));
  assert.equal(result.events[0].keySuffix, '1234');
  assert.equal(result.events[0].packageName, 'Original package');
  db.exec("UPDATE apiKeys SET tokensUsed=101,name='Renamed' WHERE id='mine'");
  assert.equal((await load()).total, 1, 'No repeat while exhausted');
  db.exec("UPDATE apiKeys SET tokenLimit=200 WHERE id='mine'; UPDATE tokenPackages SET name='New package'; UPDATE apiKeys SET tokensUsed=200 WHERE id='mine'");
  result = await load();
  assert.equal(result.total, 2, 'Refill then exhaustion produces new event');
  assert.equal(result.events[0].keyName, 'Renamed');
  assert.equal(result.events[0].packageName, 'New package');
  assert.equal(result.events[0].tokenLimit, 200);
  assert.equal(result.events[0].tokensUsed, 200);
  assert.ok(Date.parse(result.events[0].exhaustedAt));
  assert.equal(result.events[1].keyName, 'Primary', 'Snapshot survives rename');
  assert.equal(result.events[1].packageName, 'Original package');
  db.exec("UPDATE apiKeys SET tokensUsed=0 WHERE id='mine'; UPDATE apiKeys SET tokensUsed=201 WHERE id='mine'");
  assert.equal((await load()).total, 3, 'Reset permits re-exhaustion');
  db.exec("UPDATE apiKeys SET tokenLimit=0 WHERE id='mine'; UPDATE apiKeys SET tokenLimit=100 WHERE id='mine'");
  assert.equal((await load()).total, 4, 'Unlimited to exhausted counts transition');
  for (let i = 0; i < 25; i++) db.exec("UPDATE apiKeys SET tokensUsed=0 WHERE id='mine'; UPDATE apiKeys SET tokensUsed=100 WHERE id='mine'");
  db.exec("DELETE FROM apiKeys WHERE id='mine'; DELETE FROM tokenPackages");
  installQuotaHistory(db);
  result = await load();
  assert.equal(result.total, 29, 'History survives deletion and reinstallation');
  assert.equal(result.events.length, 25);
  assert.equal(result.totalPages, 2);
  assert.equal((await load('page=2')).events.length, 4);
  reinstall();
  assert.equal((await load('page=999')).page, 2);
  assert.ok(result.events.every((row, index, rows) => !index || row.id < rows[index - 1].id), 'Stable newest-first order');
  assert.equal((await load('', 'bob')).total, 1);
  assert.equal((await load('', 'stranger')).total, 0);
  assert.equal((await load('', 'stranger')).page, 1);
  assert.ok(!JSON.stringify(result).includes('sk-private'));
  assert.ok(!JSON.stringify(result).includes('5678'));
  for (const page of ['0', '-1', '1.5', 'NaN', '1e2', '100001', '', '1&page=2']) await assert.rejects(load(`page=${page}`), { status: 400 });
  await assert.rejects(customerQuotaHistory(null, new URLSearchParams()), { status: 401 });
  db.exec("INSERT INTO apiKeys VALUES ('inserted','sk-private-abcd','Inserted',NULL,5,5)");
  merchant.exec("INSERT INTO bridge_checkout VALUES ('alice','inserted')");
  result = await load();
  assert.equal(result.total, 30, 'Exhausted inserts recorded');
  assert.equal(result.events[0].keySuffix, 'abcd');
  assert.equal(result.events[0].packageName, null);
  assert.ok(Date.parse(result.events[0].exhaustedAt));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM axiom_quota_history').get().count, 31, 'Unlimited and null limits not exhausted');
  console.log('Quota history: seed, transitions, snapshots, deletion, pagination, isolation OK');
} finally {
  db.close();
  merchant.close();
}
