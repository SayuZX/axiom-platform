// JavaScript, merchant-billing.mjs, Node.js 24: site-owned packages, keys and verified QRIS ledger.
import { randomUUID } from 'node:crypto';
import { routerDb, reconcileCheckout } from './merchant-commerce.mjs';
import { merchantDb, setting } from './merchant-store.mjs';
import { fail } from './merchant-http.mjs';
import modelPolicy from './model-policy.cjs';
import requestQuotas from './request-quotas.cjs';
import { billingTrendWindow } from './merchant-billing-trend.mjs';
const { parseModelList } = modelPolicy;

function integer(value, name, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw fail(400, `${name} tidak valid.`, 'invalid_billing');
  return value;
}
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw fail(400, `${name} tidak valid.`, 'invalid_billing');
  return value.trim();
}
function strings(value, name, nullable = false) {
  if (nullable && value === null) return null;
  if (!Array.isArray(value) || value.length > 200 || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 300)) throw fail(400, `${name} tidak valid.`, 'invalid_billing');
  if (nullable) { try { const list=parseModelList(value); return list.length ? list : null; } catch { throw fail(400, `${name} tidak valid.`, 'invalid_billing'); } }
  const list = [...new Set(value.map(v => v.trim()))];
  return list;
}
function bool(value, name) {
  if (typeof value !== 'boolean') throw fail(400, `${name} harus boolean.`, 'invalid_billing');
  return value;
}
function validId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw fail(400, 'ID tidak valid.', 'invalid_billing');
  return id;
}
function parse(value, fallback) { return value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value; }
function packageView(row) {
  return {...row,isActive:!!row.isActive,isPopular:!!row.isPopular,allowedModels:parse(row.allowedModels,null),blockedModels:parse(row.blockedModels,null),features:parse(row.features,[])};
}
export function billingPackages() {
  return {packages:routerDb().prepare('SELECT * FROM tokenPackages ORDER BY sortOrder,price,id').all().map(packageView)};
}
export function savePackage(input, id = null) {
  const db=routerDb(); const now=new Date().toISOString();
  const previous=id ? db.prepare('SELECT allowedModels,blockedModels FROM tokenPackages WHERE id=?').get(validId(id)) : null;
  if (id && !previous) throw fail(404,'Paket tidak ditemukan.','not_found');
  const row = {
    name:text(input.name,'Nama paket',160,true), description:text(input.description ?? '','Deskripsi',3000),
    tokenAmount:integer(input.tokenAmount,'Token',1), price:integer(input.price,'Harga',1,10000000),
    rpmLimit:integer(input.rpmLimit,'RPM'), tpmLimit:integer(input.tpmLimit,'TPM'),
    validityDays:integer(input.validityDays,'Masa berlaku',1,3650),
    allowedModels:strings(input.allowedModels === undefined ? parse(previous?.allowedModels,null) : input.allowedModels,'Model diizinkan',true),
    blockedModels:strings(input.blockedModels === undefined ? parse(previous?.blockedModels,null) : input.blockedModels,'Model diblokir',true),
    features:strings(input.features ?? [],'Fitur'), badge:text(input.badge ?? '','Badge',100),
    isActive:bool(input.isActive,'Status aktif'), isPopular:bool(input.isPopular,'Status populer'),
    sortOrder:integer(input.sortOrder ?? 0,'Urutan',0,1000000),
  };
  const values=[row.name,row.description,row.tokenAmount,row.price,row.rpmLimit,row.tpmLimit,row.validityDays,row.allowedModels ? JSON.stringify(row.allowedModels) : null,row.blockedModels ? JSON.stringify(row.blockedModels) : null,JSON.stringify(row.features),row.badge,+row.isActive,+row.isPopular,row.sortOrder,now];
  if (id) {
    validId(id);
    const result=db.prepare('UPDATE tokenPackages SET name=?,description=?,tokenAmount=?,price=?,rpmLimit=?,tpmLimit=?,validityDays=?,allowedModels=?,blockedModels=?,features=?,badge=?,isActive=?,isPopular=?,sortOrder=?,updatedAt=? WHERE id=?').run(...values,id);
    if (!result.changes) throw fail(404,'Paket tidak ditemukan.','not_found');
  } else {
    id=randomUUID();
    db.prepare('INSERT INTO tokenPackages(name,description,tokenAmount,price,rpmLimit,tpmLimit,validityDays,allowedModels,blockedModels,features,badge,isActive,isPopular,sortOrder,updatedAt,id,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values,id,now);
  }
  return {package:packageView(db.prepare('SELECT * FROM tokenPackages WHERE id=?').get(id))};
}
export function deletePackage(id) {
  const result=routerDb().prepare('DELETE FROM tokenPackages WHERE id=?').run(validId(id));
  if (!result.changes) throw fail(404,'Paket tidak ditemukan.','not_found');
  return {ok:true};
}
const keyColumns='id,name,customerEmail,packageId,tokenLimit,tokensUsed,rpmLimit,tpmLimit,expiresAt,isActive,allowedModels,blockedModels,providerConnectionId';
function keyView(row) {
  const expired=!!row.expiresAt && Date.parse(row.expiresAt)<=Date.now();
  const exhausted=row.tokenLimit>0 && row.tokensUsed>=row.tokenLimit;
  return {...row,isActive:!!row.isActive,allowedModels:parse(row.allowedModels,null),blockedModels:parse(row.blockedModels,null),expired,exhausted,usable:!!row.isActive && !expired && !exhausted};
}
export function billingKeys() {
  const db=routerDb();
  requestQuotas.init(db);
  return {keys:db.prepare(`SELECT ${keyColumns} FROM apiKeys ORDER BY createdAt DESC,id`).all().map(row=>({...keyView(row),...requestQuotas.readLimits(db,'key',row.id)})),connections:db.prepare('SELECT id,provider,name,isActive FROM providerConnections ORDER BY provider,priority,id').all().map(row=>({...row,isActive:!!row.isActive,...requestQuotas.readLimits(db,'account',row.id)}))};
}
export function updateBillingKey(id,input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw fail(400,'Pengaturan kunci tidak valid.','invalid_billing');
  validId(id); const db=routerDb();
  const row=db.prepare(`SELECT ${keyColumns} FROM apiKeys WHERE id=?`).get(id);
  if (!row) throw fail(404,'Kunci pelanggan tidak ditemukan.','not_found');
  const permitted=['tokenLimit','rpmLimit','tpmLimit','expiresAt','isActive','allowedModels','blockedModels','providerConnectionId','threeHourRequestLimit','weeklyRequestLimit'];
  if (!Object.keys(input).length || Object.keys(input).some(k=>!permitted.includes(k))) throw fail(400,'Pengaturan kunci tidak valid.','invalid_billing');
  const limits={};
  for(const field of ['threeHourRequestLimit','weeklyRequestLimit']) if(Object.hasOwn(input,field)) limits[field]=integer(input[field],field);
  const next={...keyView(row),...input};
  if(Object.hasOwn(input,'providerConnectionId') && next.providerConnectionId !== null && next.providerConnectionId !== row.providerConnectionId) {
    if(typeof next.providerConnectionId !== 'string' || !db.prepare('SELECT id FROM providerConnections WHERE id=? AND isActive=1').get(next.providerConnectionId)) throw fail(400,'Pilih akun provider aktif yang tersedia.','invalid_billing');
  }
  integer(next.tokenLimit,'Kuota token'); integer(next.rpmLimit,'RPM'); integer(next.tpmLimit,'TPM'); bool(next.isActive,'Status aktif');
  next.allowedModels=strings(next.allowedModels,'Model diizinkan',true);
  next.blockedModels=strings(next.blockedModels,'Model diblokir',true);
  if(next.expiresAt !== null && (typeof next.expiresAt !== 'string' || !Number.isFinite(Date.parse(next.expiresAt)))) throw fail(400,'Tanggal kedaluwarsa tidak valid.','invalid_billing');
  if(next.expiresAt !== null)next.expiresAt=new Date(next.expiresAt).toISOString();
  requestQuotas.init(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE apiKeys SET tokenLimit=?,rpmLimit=?,tpmLimit=?,expiresAt=?,isActive=?,allowedModels=?,blockedModels=?,providerConnectionId=? WHERE id=?').run(next.tokenLimit,next.rpmLimit,next.tpmLimit,next.expiresAt,+next.isActive,next.allowedModels?JSON.stringify(next.allowedModels):null,next.blockedModels?JSON.stringify(next.blockedModels):null,next.providerConnectionId,id);
    if(Object.keys(limits).length) requestQuotas.setLimits(db,'key',id,limits);
    const result={key:{...keyView(next),...requestQuotas.readLimits(db,'key',id)}};
    db.exec('COMMIT');
    return result;
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}
export function updateBillingAccount(id,input) {
  validId(id);
  if(!input || typeof input!=='object' || Array.isArray(input)) throw fail(400,'Pengaturan akun tidak valid.','invalid_billing');
  if(Object.keys(input).length!==1 || !Object.hasOwn(input,'dailyRequestLimit')) throw fail(400,'Pengaturan akun tidak valid.','invalid_billing');
  const limits={dailyRequestLimit:integer(input.dailyRequestLimit,'Batas request harian')};
  const db=routerDb();
  requestQuotas.init(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row=db.prepare('SELECT id,provider,name,isActive FROM providerConnections WHERE id=?').get(id);
    if(!row) throw fail(404,'Akun provider tidak ditemukan.','not_found');
    requestQuotas.setLimits(db,'account',id,limits);
    const result={account:{...row,isActive:!!row.isActive,...requestQuotas.readLimits(db,'account',id)}};
    db.exec('COMMIT');
    return result;
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}
const orderStatuses=['creating','unknown','pending','settlement','cancel','expire','deny','failure'];
export async function billingStats() {
  const [[row]]=await merchantDb().query("SELECT COUNT(*) orders,COALESCE(SUM(state='settlement'),0) total_paid,COALESCE(SUM(state IN ('creating','unknown','pending')),0) pending,COALESCE(SUM(CASE WHEN state='settlement' AND funding='qris' THEN amount ELSE 0 END),0) revenue_idr,COALESCE(SUM(api_key_id IS NOT NULL),0) issued_keys,COALESCE(SUM(CASE WHEN api_key_id IS NOT NULL THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(package_snapshot,'$.tokenLimit')) AS UNSIGNED) ELSE 0 END),0) tokens_allocated FROM bridge_checkout");
  const amounts=Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Number(value)]));
  if(!Object.values(amounts).every(Number.isSafeInteger)) throw fail(500,'Jumlah ledger melebihi batas representasi.','ledger_range');
  const {start,end,trend}=billingTrendWindow();
  // paid_at is a UTC DATETIME; explicit offsets avoid session/named-timezone dependencies.
  const [daily]=await merchantDb().execute("SELECT DATE_FORMAT(DATE_ADD(paid_at,INTERVAL 7 HOUR),'%Y-%m-%d') date,SUM(amount) amount FROM bridge_checkout WHERE state='settlement' AND funding='qris' AND paid_at>=? AND paid_at<? GROUP BY date ORDER BY date",[start,end]);
  const receipts=new Map(daily.map(row=>[row.date,Number(row.amount)]));
  for(const day of trend) day.amount=receipts.get(day.date) ?? 0;
  const [counts]=await merchantDb().query('SELECT state status,COUNT(*) count FROM bridge_checkout GROUP BY state');
  const statusCounts=new Map(counts.map(row=>[row.status,Number(row.count)]));
  const statuses=orderStatuses.map(status=>({status,count:statusCounts.get(status) ?? 0}));
  if(![...receipts.values(),...statusCounts.values()].every(Number.isSafeInteger)) throw fail(500,'Jumlah ledger melebihi batas representasi.','ledger_range');
  const account=await setting('website_merchant');
  return {...amounts,currency:'IDR',configured:!!account,accountLabel:account?.accountLabel || null,trend,statuses};
}
function orderView(row) {
  return {id:row.id,email:row.email,package_name:parse(row.package_snapshot,{}).name,amount:Number(row.amount),state:row.state,kind:row.kind,funding:row.funding,created_at:row.created_at,paid_at:row.paid_at,fulfilled:row.kind==='topup'?!!row.wallet_credited:!!row.api_key_id};
}
export async function billingOrders(page=1,status='') {
  integer(page,'Halaman',1,100000);
  if(status && !orderStatuses.includes(status)) throw fail(400,'Status tidak valid.','invalid_billing');
  const where=status?' WHERE state=?':'';const args=status?[status]:[];
  const [[count]]=await merchantDb().execute('SELECT COUNT(*) total FROM bridge_checkout'+where,args);
  const [rows]=await merchantDb().query('SELECT id,email,package_snapshot,amount,state,kind,funding,wallet_credited,created_at,paid_at,api_key_id FROM bridge_checkout'+where+' ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?',[...args,(page-1)*20]);
  return {orders:rows.map(orderView),page,total:Number(count.total),total_pages:Math.max(1,Math.ceil(Number(count.total)/20))};
}
export async function syncBillingOrder(id,cancel=false) {
  validId(id);
  // The API invokes this only after native site-admin auth; provider observation still decides settlement.
  await reconcileCheckout(id,null,{trusted:true,cancel});
  const [[row]]=await merchantDb().execute('SELECT id,email,package_snapshot,amount,state,kind,funding,wallet_credited,created_at,paid_at,api_key_id FROM bridge_checkout WHERE id=?',[id]);
  if(!row)throw fail(404,'Pesanan tidak ditemukan.','not_found');
  return {order:orderView(row)};
}
