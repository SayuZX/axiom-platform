// JavaScript, grant-admin.cjs, Node.js 24: explicitly promote a pre-existing verified customer.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const [databasePath, username, expectedId] = process.argv.slice(2);
if (!databasePath || !/^[A-Za-z0-9_]{3,32}$/.test(username || '') || !/^[A-Za-z0-9_-]{43}$/.test(expectedId || '')) throw new Error('Usage: node grant-admin.cjs DATABASE USERNAME EXPECTED_CUSTOMER_ID');
const db = new DatabaseSync(databasePath);
try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
    const customer = db.prepare('SELECT id,username FROM customers WHERE username=? COLLATE NOCASE').get(username);
    if (!customer || customer.id !== expectedId) throw new Error('Existing customer identity does not match; no role was granted.');
    if (!db.prepare('PRAGMA table_info(customers)').all().some(column => column.name === 'role')) db.exec("ALTER TABLE customers ADD COLUMN role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin'))");
    db.prepare("UPDATE customers SET role='admin' WHERE id=?").run(customer.id);
    db.exec('COMMIT');
    console.log(JSON.stringify({ username: customer.username, role: 'admin', password_unchanged: true }));
} catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
finally { db.close(); }
