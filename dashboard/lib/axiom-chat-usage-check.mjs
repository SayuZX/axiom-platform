// Run: node lib/axiom-chat-usage-check.mjs
// Guards ownership, verified weighted debit, nullable prices, and bounded history.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { keyUsage } from './axiom-chat-bridge.mjs';
const db=new DatabaseSync(':memory:');
try {
  db.exec(`CREATE TABLE apiKeys(id TEXT PRIMARY KEY,tokenLimit INTEGER,tokensUsed INTEGER,key TEXT);
    CREATE TABLE axiom_usage_ledger(request_id TEXT,api_key_id TEXT,model TEXT,requested_at INTEGER,status TEXT,billing_status TEXT,input_tokens INTEGER,output_tokens INTEGER,debit_tokens INTEGER,sale_cost_idr REAL);
    INSERT INTO apiKeys VALUES ('owned',1000,400,'secret'),('foreign',100,20,'foreign-secret'),('unlimited',0,500,'secret'),('expired',100,2,'secret');`);
  const owned=[{id:'owned',usable:true},{id:'unlimited',usable:true},{id:'expired',usable:false}];
  const insert=db.prepare('INSERT INTO axiom_usage_ledger VALUES (?,?,?,?,?,?,?,?,?,?)');
  insert.run('a','owned','ax/model',1,'completed','priced',10,5,30,2.5);
  insert.run('b','owned','ax/model',2,'completed','sale_priced',2,1,0,0);
  insert.run('c','owned','ax/model',3,'completed','unpriced',1,1,null,null);
  insert.run('d','owned','ax/model',4,'failed','failed',9,9,999,999);
  insert.run('e','owned','ax/model',5,'completed','unverified_usage',9,9,999,999);
  insert.run('f','foreign','ax/model',6,'completed','priced',9,9,999,999);
  insert.run('g','unlimited','ax/model',7,'completed','priced',4,2,12,null);
  db.exec('PRAGMA query_only=ON');
  assert.throws(()=>keyUsage(db,owned,'foreign'),{status:404});
  assert.throws(()=>keyUsage(db,owned,'expired'),{status:403});
  assert.throws(()=>keyUsage(db,owned,"owned' OR 1=1 --"),{status:404});
  const usage=keyUsage(db,owned,'owned',Date.UTC(2026,9,19,12));
  const {daily,...summary}=JSON.parse(JSON.stringify(usage));
  assert.deepEqual(summary,{keyId:'owned',tokenLimit:1000,tokensUsed:400,remainingTokens:600,debitedTokens:30,spentIdr:2.5,requests:5,recent:[
    {model:'ax/model',inputTokens:9,outputTokens:9,debitTokens:null,saleCostIdr:null,requestedAt:5},
    {model:'ax/model',inputTokens:9,outputTokens:9,debitTokens:null,saleCostIdr:null,requestedAt:4},
    {model:'ax/model',inputTokens:1,outputTokens:1,debitTokens:null,saleCostIdr:null,requestedAt:3},
    {model:'ax/model',inputTokens:2,outputTokens:1,debitTokens:0,saleCostIdr:0,requestedAt:2},
    {model:'ax/model',inputTokens:10,outputTokens:5,debitTokens:30,saleCostIdr:2.5,requestedAt:1}
  ]});
  assert.equal(daily.length,7);
  assert.deepEqual(daily.map(row=>row.debitedTokens),[0,0,0,0,0,0,0]);
  const unlimited=keyUsage(db,owned,'unlimited');
  assert.equal(unlimited.remainingTokens,null);
  assert.equal(unlimited.spentIdr,null);
  assert.equal(unlimited.debitedTokens,12);
  db.exec('PRAGMA query_only=OFF');
  for(let i=0;i<25;i++) insert.run(`new-${i}`,'owned','ax/model',100+i,'completed','sale_priced',1,0,1,0);
  db.exec('PRAGMA query_only=ON');
  const bounded=keyUsage(db,owned,'owned');
  assert.equal(bounded.requests,30);
  assert.equal(bounded.debitedTokens,55);
  assert.equal(bounded.recent.length,20);
  assert.equal(bounded.recent[0].requestedAt,124);
  assert.equal(bounded.recent[19].requestedAt,105);
  db.exec('PRAGMA query_only=OFF');
  const today=Date.UTC(2026,9,19,12);
  insert.run('today','unlimited','ax/model',today,'completed','sale_priced',100,10,11,.0095);
  insert.run('yesterday','unlimited','ax/model',today-86400000,'completed','sale_priced',80,5,5,.002);
  db.exec('PRAGMA query_only=ON');
  const weekly=keyUsage(db,owned,'unlimited',today);
  assert.deepEqual(weekly.daily.slice(-2).map(row=>[row.date,row.debitedTokens,row.spentIdr]),[['2026-10-18',5,.002],['2026-10-19',11,.0095]]);
  assert.equal(weekly.daily.length,7);
} finally { db.close(); }
