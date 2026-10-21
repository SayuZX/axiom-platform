// JavaScript, billing-binding-check.mjs, Node.js 24: isolated billing account assignment.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const dir=mkdtempSync(path.join(tmpdir(),'binding-billing-'));mkdirSync(path.join(dir,'db'));process.env.NINEROUTER_DATA_DIR=dir;
const source=new DatabaseSync('C:/ProgramData/9router/db/data.sqlite',{readOnly:true});const db=new DatabaseSync(path.join(dir,'db/data.sqlite'));
for(const row of source.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all())db.exec(row.sql);source.close();
db.exec("INSERT INTO apiKeys(id,key,name,isActive,tokenLimit,tokensUsed,rpmLimit,tpmLimit,createdAt) VALUES('fixture','fixture','fixture',1,1000,123,10,100,'2026-10-11'); INSERT INTO providerConnections(id,provider,isActive,name,authType,data,createdAt,updatedAt) VALUES('account','codex',1,'Codex fixture','oauth','{}','2026-10-11','2026-10-11')");db.close();
const {billingKeys,updateBillingKey}=await import('./lib/merchant-billing.mjs');const {routerDb}=await import('./lib/merchant-commerce.mjs');
try{const key=updateBillingKey('fixture',{providerConnectionId:'account'}).key;assert.equal(key.providerConnectionId,'account');assert.equal(key.tokensUsed,123);assert.equal(key.tokenLimit,1000);assert.equal(updateBillingKey('fixture',{rpmLimit:20}).key.providerConnectionId,'account');assert.throws(()=>updateBillingKey('fixture',{providerConnectionId:'missing'}));assert.equal(billingKeys().connections[0].provider,'codex');assert.equal(updateBillingKey('fixture',{providerConnectionId:null}).key.providerConnectionId,null);console.log('PASS billing binding: set, preserve, reject, clear; usage unchanged');}finally{routerDb().close();rmSync(dir,{recursive:true,force:true});}
