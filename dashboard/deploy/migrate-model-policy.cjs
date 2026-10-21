// JavaScript, migrate-policy.cjs, Node.js 24/Windows: additive policy migration, no entitlement rewrite.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const [file, backupDir] = process.argv.slice(2);
if (!file || !backupDir) throw new Error('Usage: node migrate-policy.cjs DATABASE BACKUP_DIRECTORY');
const db = new DatabaseSync(file);
db.exec('PRAGMA busy_timeout=10000');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, 'data-before.sqlite');
db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
const keys = db.prepare('SELECT * FROM apiKeys ORDER BY id').all();
const packages = db.prepare('SELECT * FROM tokenPackages ORDER BY id').all();
db.exec('BEGIN IMMEDIATE');
try {
  for (const table of ['apiKeys', 'tokenPackages']) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === 'blockedModels')) db.exec(`ALTER TABLE ${table} ADD COLUMN blockedModels TEXT`);
  }
  for (const [table, before] of [['apiKeys', keys], ['tokenPackages', packages]]) {
    const columns = Object.keys(before[0] || {}).filter(column => column !== 'blockedModels');
    if (columns.length) {
      const after = db.prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY id`).all();
      assert.ok(JSON.stringify(after) === JSON.stringify(before.map(row => Object.fromEntries(columns.map(column => [column, row[column]])))), `${table} values changed; migration rolled back`);
    }
  }
  db.exec('COMMIT');
  console.log(JSON.stringify({ migrated: true, keysPreserved: keys.length, packagesPreserved: packages.length, backup }));
} catch (error) { db.exec('ROLLBACK'); throw error; }
finally { db.close(); }
