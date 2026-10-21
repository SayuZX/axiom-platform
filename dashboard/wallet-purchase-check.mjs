// JavaScript, wallet-purchase-check.mjs, Node.js24: real temporary MariaDB tables and isolated SQLite.
import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {loadEnvFile} from 'node:process';
loadEnvFile('.env.production.local');
const root=mkdtempSync(path.join(tmpdir(),'axiom-wallet-'));mkdirSync(path.join(root,'db'));process.env.NINEROUTER_DATA_DIR=root;
const seed=new DatabaseSync(path.join(root,'db','data.sqlite'));
seed.exec('CREATE TABLE tokenPackages(id TEXT PRIMARY KEY,name TEXT,description TEXT,price INTEGER,tokenAmount INTEGER,validityDays INTEGER,rpmLimit INTEGER,tpmLimit INTEGER,allowedModels TEXT,blockedModels TEXT,features TEXT,badge TEXT,isActive INTEGER,isPopular INTEGER,sortOrder INTEGER);CREATE TABLE apiKeys(id TEXT PRIMARY KEY,key TEXT,name TEXT,machineId TEXT,isActive INTEGER,createdAt TEXT,tokenLimit INTEGER,tokensUsed INTEGER,rpmLimit INTEGER,tpmLimit INTEGER,expiresAt TEXT,customerEmail TEXT,packageId TEXT,allowedModels TEXT,blockedModels TEXT,notes TEXT)');
seed.prepare('INSERT INTO tokenPackages(id,name,price,tokenAmount,validityDays,rpmLimit,tpmLimit,features,isActive,isPopular,sortOrder) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('package','Test package',10000,25000,30,10,0,'[]',1,0,0);seed.prepare('UPDATE tokenPackages SET allowedModels=?,blockedModels=?').run(JSON.stringify(['cx/*']),JSON.stringify(['blocked']));seed.close();
const {merchantDb}=await import('./lib/merchant-store.mjs');const {routerDb,reconcileCheckout}=await import('./lib/merchant-commerce.mjs');const {applyWalletEntry}=await import('./lib/customer-wallet-store.mjs');const {purchaseWithWallet,walletSummary}=await import('./lib/customer-wallet.mjs');
const pool=merchantDb();const connection=await pool.getConnection();
const release=connection.release.bind(connection);const acquire=pool.getConnection.bind(pool);const execute=pool.execute.bind(pool);const query=pool.query.bind(pool);
try{
 await connection.query('CREATE TEMPORARY TABLE bridge_wallets(customer_id VARCHAR(36) PRIMARY KEY,balance BIGINT NOT NULL,updated_at DATETIME(6)) ENGINE=InnoDB');
 await connection.query('CREATE TEMPORARY TABLE bridge_wallet_entries(id BIGINT AUTO_INCREMENT PRIMARY KEY,customer_id VARCHAR(36),reference VARCHAR(128) UNIQUE,kind VARCHAR(16),amount BIGINT,balance_after BIGINT,created_at DATETIME(6)) ENGINE=InnoDB');
 await connection.query("CREATE TEMPORARY TABLE bridge_checkout(id VARCHAR(36) PRIMARY KEY,customer_id VARCHAR(36),email VARCHAR(254),package_id VARCHAR(128),package_snapshot JSON,amount BIGINT,kind VARCHAR(16),funding VARCHAR(16),state VARCHAR(24),payment_json JSON,api_key_id VARCHAR(128),token_hash CHAR(64),wallet_credited BOOLEAN DEFAULT FALSE,paid_at DATETIME(6),created_at DATETIME(6),updated_at DATETIME(6)) ENGINE=InnoDB");
 // Bind all calls to this session's real temporary tables, never permanent customer rows.
 connection.release=()=>{};pool.getConnection=async()=>connection;pool.execute=connection.execute.bind(connection);pool.query=connection.query.bind(connection);
 const customer={id:randomUUID(),email:'wallet@example.invalid'};
 await connection.beginTransaction();await applyWalletEntry(connection,customer.id,'initial-credit','topup',20000);await connection.commit();
 const request={package_id:'package',request_id:randomUUID()};const first=await purchaseWithWallet(request,customer);assert.equal(first.fulfilled,true);assert.equal(first.payment.source,'wallet');assert.equal(first.payment.amount,10000);
 const again=await purchaseWithWallet(request,customer);assert.equal(again.api_key,first.api_key);assert.equal((await walletSummary(customer)).balance,10000);
 const keys=routerDb().prepare('SELECT tokenLimit,tokensUsed,rpmLimit,allowedModels,blockedModels,expiresAt FROM apiKeys').all();assert.equal(keys.length,1);assert.equal(keys[0].tokenLimit,25000);
 assert.deepEqual(JSON.parse(keys[0].allowedModels),['cx/*']);assert.deepEqual(JSON.parse(keys[0].blockedModels),['blocked']);
 const [[order]]=await connection.execute('SELECT package_snapshot FROM bridge_checkout WHERE id=?',[first.id]);
 const snapshot=typeof order.package_snapshot==='string'?JSON.parse(order.package_snapshot):order.package_snapshot;
 assert.deepEqual(snapshot.allowedModels,['cx/*']);assert.deepEqual(snapshot.blockedModels,['blocked']);
 routerDb().prepare('UPDATE tokenPackages SET allowedModels=NULL,blockedModels=NULL').run();
 routerDb().prepare('UPDATE apiKeys SET tokensUsed=321').run();
 await purchaseWithWallet(request,customer);
 const retained=routerDb().prepare('SELECT tokenLimit,tokensUsed,rpmLimit,allowedModels,blockedModels,expiresAt FROM apiKeys').get();
 assert.deepEqual({...retained},{...keys[0],tokensUsed:321});
 const [[replayedOrder]]=await connection.execute('SELECT package_snapshot FROM bridge_checkout WHERE id=?',[first.id]);
 assert.deepEqual(typeof replayedOrder.package_snapshot==='string'?JSON.parse(replayedOrder.package_snapshot):replayedOrder.package_snapshot,snapshot);
 await assert.rejects(purchaseWithWallet({...request,package_id:'different'},customer),{code:'purchase_conflict'});
 await assert.rejects(reconcileCheckout(first.id,{id:randomUUID()}),{code:'not_found'});
 const next={package_id:'package',request_id:randomUUID()};await purchaseWithWallet(next,customer);assert.equal((await walletSummary(customer)).balance,0);
 await assert.rejects(purchaseWithWallet({package_id:'package',request_id:randomUUID()},customer),{code:'insufficient_balance'});
 console.log('PASS: real isolated wallet purchase, same-request key replay, ownership, no double debit, insufficient-balance rollback; no live balance or key changed.');
}finally{pool.getConnection=acquire;pool.execute=execute;pool.query=query;connection.release=release;await connection.destroy();await pool.end();routerDb().close();rmSync(root,{recursive:true,force:true});}
