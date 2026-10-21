// JavaScript, wallet-check.mjs, Node.js24/MariaDB: isolated ledger consistency, no real credits.
import assert from 'node:assert/strict';
import {loadEnvFile} from 'node:process';
import mysql from 'mysql2/promise';
import {applyWalletEntry} from './lib/customer-wallet-store.mjs';
loadEnvFile('.env.production.local');
const db=await mysql.createConnection(process.env.MERCHANT_DATABASE_URL);
try{
  await db.query('CREATE TEMPORARY TABLE bridge_wallets(customer_id VARCHAR(36) PRIMARY KEY,balance BIGINT NOT NULL,updated_at DATETIME(6)) ENGINE=InnoDB');
  await db.query('CREATE TEMPORARY TABLE bridge_wallet_entries(id BIGINT AUTO_INCREMENT PRIMARY KEY,customer_id VARCHAR(36),reference VARCHAR(128) UNIQUE,kind VARCHAR(16),amount BIGINT,balance_after BIGINT,created_at DATETIME(6)) ENGINE=InnoDB');
  await db.beginTransaction();assert.equal(await applyWalletEntry(db,'a','topup-1','topup',10000),10000);await db.commit();
  await db.beginTransaction();assert.equal(await applyWalletEntry(db,'a','topup-1','topup',10000),10000);await db.commit();
  await db.beginTransaction();assert.equal(await applyWalletEntry(db,'a','order-1','purchase',-7000),3000);await db.commit();
  await db.beginTransaction();assert.equal(await applyWalletEntry(db,'a','order-1','purchase',-7000),3000);await db.commit();
  await db.beginTransaction();await assert.rejects(applyWalletEntry(db,'a','order-2','purchase',-4000),{code:'insufficient_balance'});await db.rollback();
  await db.beginTransaction();await assert.rejects(applyWalletEntry(db,'a','topup-1','topup',15000),{code:'wallet_conflict'});await db.rollback();
  await db.beginTransaction();await assert.rejects(applyWalletEntry(db,'b','topup-1','topup',10000),{code:'wallet_conflict'});await db.rollback();
  const [[wallet]]=await db.query('SELECT balance FROM bridge_wallets WHERE customer_id=?',['a']);assert.equal(Number(wallet.balance),3000);
  const [[entries]]=await db.query('SELECT COUNT(*) n,SUM(amount) net FROM bridge_wallet_entries WHERE customer_id=?',['a']);assert.equal(entries.n,2);assert.equal(Number(entries.net),3000);
  console.log('PASS: duplicate credits/debits idempotent, insufficient funds preserved, conflicting/cross-customer references rejected; no live wallet modified.');
}finally{await db.end();}
