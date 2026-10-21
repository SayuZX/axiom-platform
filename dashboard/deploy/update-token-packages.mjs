// JavaScript, update-token-packages.mjs, Node.js 24: preview/apply the reviewed AXIOM package revision.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const root = process.env.NINEROUTER_DATA_DIR;
if (!root) throw new Error('NINEROUTER_DATA_DIR is required.');
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Usage: node deploy/update-token-packages.mjs [--apply]');
const db = new DatabaseSync(path.join(root, 'db', 'data.sqlite'), { readOnly: !apply });
db.exec('PRAGMA busy_timeout=5000');
const plans = [
  { id: '26493209-823d-4174-9026-f91c91b11869', name: 'Paket Starter', tokenAmount: 20000000, price: 10000, rpmLimit: 60, validityDays: 30, description: '20 juta token untuk eksplorasi API, prototipe, dan penggunaan ringan.' },
  { id: 'c8c7f596-4938-4dfb-bcf3-a546c310f89b', name: 'Paket Developer', tokenAmount: 45000000, price: 20000, rpmLimit: 60, validityDays: 30, description: '45 juta token untuk coding harian dan integrasi editor.' },
  { id: 'f7ae1dca-4f06-4f9d-a926-264d62351e36', name: 'Paket Pro', tokenAmount: 230000000, price: 79000, rpmLimit: 90, validityDays: 60, description: '230 juta token untuk aplikasi, bot, dan kebutuhan tim.' },
  { id: 'ca032c9c-7ad1-42d3-be9d-b3b1e9139d24', name: 'Paket Enterprise', tokenAmount: 1000000000, price: 299000, rpmLimit: 300, validityDays: 90, description: '1 miliar token untuk penggunaan berskala besar dengan masa aktif 90 hari.' },
];
try {
  if (apply) db.exec('BEGIN IMMEDIATE');
  const before = plans.map(plan => {
    const row = db.prepare('SELECT * FROM tokenPackages WHERE id=?').get(plan.id);
    assert.ok(row, `Missing package ${plan.name}; refusing to create a duplicate.`);
    assert.equal(row.name, plan.name, 'Package identity changed; review before applying.');
    assert.equal(row.validityDays, plan.validityDays, 'Validity changed; review before applying.');
    return row;
  });
  const keysBefore = apply ? db.prepare('SELECT * FROM apiKeys ORDER BY id').all() : null;
  const update = apply ? db.prepare('UPDATE tokenPackages SET tokenAmount=?,price=?,rpmLimit=?,description=?,features=?,updatedAt=? WHERE id=?') : null;
  for (const plan of plans) {
    const features = [
      `${plan.tokenAmount.toLocaleString('id-ID')} token input + output`,
      `Batas ${plan.rpmLimit} permintaan per menit`,
      `Masa aktif ${plan.validityDays} hari setelah aktivasi`,
      'Kuota tanpa pengali harga model',
      'Model sesuai katalog dan ketersediaan provider',
      'Bayar sekali melalui QRIS atau saldo situs',
    ];
    if (apply) assert.equal(update.run(plan.tokenAmount, plan.price, plan.rpmLimit, plan.description, JSON.stringify(features), new Date().toISOString(), plan.id).changes, 1);
  }
  if (apply) {
    // Existing customer keys and checkout snapshots retain the terms already purchased.
    assert.deepEqual(db.prepare('SELECT * FROM apiKeys ORDER BY id').all(), keysBefore);
    db.exec('COMMIT');
  }
  console.log(JSON.stringify({ applied: apply, packages: plans.map((plan, index) => ({ ...plan, previous: { tokenAmount: before[index].tokenAmount, price: before[index].price, rpmLimit: before[index].rpmLimit }, pricePerMillion: plan.price * 1000000 / plan.tokenAmount })) }, null, 2));
} catch (error) {
  if (apply && db.isTransaction) db.exec('ROLLBACK');
  throw error;
} finally { db.close(); }
