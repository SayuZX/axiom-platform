import { createHmac, randomUUID } from 'node:crypto';
import modelPolicy from './model-policy.cjs';
const { policyAllowsModel } = modelPolicy;
function reject(status, code) { throw Object.assign(new Error(code), { status, code }); }
export function scopedKey(keys, keyId, model, catalog) {
  const key=keys.find(item=>item.id===keyId);
  if(!key) reject(404,'key_not_found');
  if(!key.usable) reject(403,'key_unavailable');
  if(model && (!catalog.some(item=>item.id===model) || !policyAllowsModel(key,model))) reject(403,'model_not_allowed');
  return key;
}
// Ledger totals cover post-cutover records; tokensUsed also includes legacy usage.
export function keyUsage(db, keys, keyId, now=Date.now()) {
  scopedKey(keys,keyId);
  const key=db.prepare('SELECT tokenLimit,tokensUsed FROM apiKeys WHERE id=?').get(keyId);
  if(!key) reject(404,'key_not_found');
  const billable="status='completed' AND billing_status IN ('priced','sale_priced') AND debit_tokens IS NOT NULL";
  const totals=db.prepare(`SELECT COUNT(*) requests,
    COALESCE(SUM(CASE WHEN ${billable} THEN debit_tokens END),0) debitedTokens,
    SUM(CASE WHEN ${billable} THEN sale_cost_idr END) spentIdr
    FROM axiom_usage_ledger WHERE api_key_id=?`).get(keyId);
  const recent=db.prepare(`SELECT model,input_tokens AS inputTokens,output_tokens AS outputTokens,
    CASE WHEN ${billable} THEN debit_tokens END AS debitTokens,
    CASE WHEN ${billable} THEN sale_cost_idr END AS saleCostIdr,requested_at AS requestedAt
    FROM axiom_usage_ledger WHERE api_key_id=? ORDER BY requested_at DESC,request_id DESC LIMIT 20`).all(keyId);
  const start=new Date(now);start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-6);
  const rows=db.prepare(`SELECT date(requested_at/1000,'unixepoch') date,COUNT(*) requests,
    COALESCE(SUM(debit_tokens),0) debitedTokens,SUM(sale_cost_idr) spentIdr FROM axiom_usage_ledger
    WHERE api_key_id=? AND ${billable} AND requested_at>=? AND requested_at<=? GROUP BY date`).all(keyId,start.getTime(),now);
  const byDate=new Map(rows.map(row=>[row.date,row]));
  const daily=Array.from({length:7},(_,index)=>{
    const date=new Date(start.getTime()+index*86400000).toISOString().slice(0,10);
    const row=byDate.get(date);
    return {date,requests:row?.requests??0,debitedTokens:row?.debitedTokens??0,spentIdr:row?row.spentIdr:0};
  });
  const tokenLimit=Number(key.tokenLimit ?? 0), tokensUsed=Number(key.tokensUsed ?? 0);
  return {keyId,tokenLimit,tokensUsed,remainingTokens:tokenLimit===0?null:Math.max(0,tokenLimit-tokensUsed),
    debitedTokens:totals.debitedTokens,spentIdr:totals.spentIdr,requests:totals.requests,recent,daily};
}
export function internalHeaders(identity, secret, now=Date.now()) {
  if(!Buffer.isBuffer(secret)||secret.length!==32) throw new Error('AXIOM Chat internal secret must be 32 bytes');
  if(typeof identity.customerId!=='string'||!identity.customerId||identity.keyId&&!identity.key) throw new TypeError('Invalid identity');
  const token=Buffer.from(JSON.stringify({customerId:identity.customerId,...(identity.keyId?{keyId:identity.keyId,key:identity.key}:{}),iat:now,nonce:randomUUID()})).toString('base64url');
  return {'x-axiom-identity':token,'x-axiom-signature':createHmac('sha256',secret).update(token).digest('hex')};
}
