import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { merchantDb, setting, seal, unseal, hashToken } from './merchant-store.mjs';
import { fail, merchantRequest, sameSecret, validEmail } from './merchant-http.mjs';
import { applyWalletEntry } from './customer-wallet-store.mjs';
import modelPolicy from './model-policy.cjs';
const { parseModelList } = modelPolicy;

let router;
export function routerDb() {
  const root = process.env.NINEROUTER_DATA_DIR;
  if (!root) throw fail(503, 'Penyimpanan router belum dikonfigurasi.', 'configuration_required');
  router ??= new DatabaseSync(path.join(root, 'db', 'data.sqlite'));
  router.exec('PRAGMA busy_timeout=5000');
  return router;
}
export function packageSnapshot(row) {
  if (!row || !row.isActive || !Number.isSafeInteger(row.price) || row.price < 1 || row.price > 10_000_000 || !Number.isSafeInteger(row.tokenAmount) || row.tokenAmount < 1 || !Number.isInteger(row.validityDays) || row.validityDays < 1 || row.validityDays > 3650) return null;
  let allowedModels, blockedModels;
  try {
    allowedModels=row.allowedModels == null ? null : parseModelList(row.allowedModels);
    blockedModels=row.blockedModels == null ? null : parseModelList(row.blockedModels);
  } catch { return null; }
  return { id: row.id, name: row.name, description: row.description || '', price: row.price, currency: 'IDR', tokenLimit: row.tokenAmount, validDays: row.validityDays, rpmLimit: row.rpmLimit || 0, tpmLimit: row.tpmLimit || 0, allowedModels, blockedModels, features:decodeJson(row.features || '[]'), badge:row.badge || '', isPopular:!!row.isPopular };
}
export async function packages() {
  const merchant = await setting('website_merchant');
  const rows = routerDb().prepare('SELECT * FROM tokenPackages WHERE isActive=1 ORDER BY sortOrder,price').all();
  let connected = false;
  if (merchant) {
    try { const me = await merchantRequest('/api/auth/me', merchant.key); connected = me.authenticated === true && me.merchant_id === merchant.merchantId; } catch {}
  }
  return { configured: connected, packages: rows.map(packageSnapshot).filter(Boolean) };
}
function decodeJson(value) { return typeof value === 'string' ? JSON.parse(value) : value; }
function validPayment(payment, row) {
  if (!payment || payment.order_id !== row.id || !Number.isSafeInteger(payment.amount) || payment.amount !== Number(row.amount) || !['pending','settlement','cancel','expire','deny','failure'].includes(payment.status)) throw fail(502, 'Identitas, nominal, atau status pembayaran tidak cocok.', 'payment_mismatch');
  if (payment.currency && payment.currency !== 'IDR') throw fail(502, 'Mata uang pembayaran tidak sesuai.', 'payment_mismatch');
  if (payment.status === 'settlement' && !payment.transaction_id) throw fail(502, 'ID transaksi provider belum tersedia.', 'payment_mismatch');
  return payment;
}
function customerView(row, payment) {
  let apiKey;
  if (row.api_key_id) apiKey = routerDb().prepare('SELECT key FROM apiKeys WHERE id=?').get(row.api_key_id)?.key;
  const pkg = decodeJson(row.package_snapshot);
  return { id: row.id, payment, kind:row.kind || 'package', funding:row.funding || 'qris', fulfilled:row.kind==='topup'?!!row.wallet_credited:Boolean(apiKey), ...(apiKey ? { api_key: apiKey } : {}), packageName: pkg.name };
}
function fulfill(row) {
  const db = routerDb();
  const id = 'qris_' + row.id;
  const pkg = decodeJson(row.package_snapshot);
  if (!Number.isSafeInteger(pkg.tokenLimit) || pkg.tokenLimit < 1) throw fail(500, 'Paket pembayaran tidak valid.', 'invalid_package');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT id FROM apiKeys WHERE id=?').get(id)) {
      const key = 'sk-axiom-' + randomBytes(32).toString('hex');
      const created = new Date();
      const expires = new Date(created.getTime() + pkg.validDays * 86400_000).toISOString();
      db.prepare('INSERT INTO apiKeys(id,key,name,machineId,isActive,createdAt,tokenLimit,tokensUsed,rpmLimit,tpmLimit,expiresAt,customerEmail,packageId,allowedModels,blockedModels,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,key,pkg.name,'axiom-qris',1,created.toISOString(),pkg.tokenLimit,0,pkg.rpmLimit,pkg.tpmLimit,expires,row.email,pkg.id,pkg.allowedModels ? JSON.stringify(pkg.allowedModels) : null,pkg.blockedModels ? JSON.stringify(pkg.blockedModels) : null,'Verified GoPay QRIS order '+row.id);
    }
    db.exec('COMMIT');
    return id;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export async function createCheckout(input, customer) {
  if (!customer?.id) throw fail(401, 'Masuk ke akun AXIOM sebelum membeli paket.', 'customer_login_required');
  if (typeof input.package_id !== 'string' || input.package_id.length > 128) throw fail(400, 'Paket tidak valid.', 'invalid_package');
  const pkg = packageSnapshot(routerDb().prepare('SELECT * FROM tokenPackages WHERE id=?').get(input.package_id));
  if (!pkg) throw fail(404, 'Paket tidak tersedia.', 'package_unavailable');
  return createProviderCheckout(pkg,customer,'package');
}

export async function createTopup(amount,customer) {
  if (!customer?.id) throw fail(401,'Masuk ke akun AXIOM sebelum mengisi saldo.','customer_login_required');
  if (!Number.isSafeInteger(amount)||amount<1000||amount>10000000) throw fail(400,'Isi saldo harus Rp1.000–Rp10.000.000 dalam Rupiah bulat.','invalid_amount');
  return createProviderCheckout({id:'wallet-topup',name:'Isi saldo AXIOM',price:amount,currency:'IDR'},customer,'topup');
}

async function createProviderCheckout(pkg,customer,kind) {
  const email=validEmail(customer.email);
  const account = await setting('website_merchant');
  if (!account) throw fail(503, 'QRIS belum diaktifkan. Admin perlu menghubungkan akun merchant.', 'merchant_not_configured');
  const me = await merchantRequest('/api/auth/me', account.key);
  if (!me.authenticated || me.merchant_id !== account.merchantId) throw fail(503, 'Sesi merchant perlu dihubungkan ulang oleh admin.', 'merchant_not_connected');
  const id = randomUUID();
  const row = { id, email, customer_id:customer.id, amount: pkg.price, package_snapshot: pkg, merchant_key_encrypted: seal(account.key), merchant_user_id: account.userId };
  await merchantDb().execute('INSERT INTO bridge_checkout(id,customer_id,email,package_id,package_snapshot,merchant_user_id,merchant_key_encrypted,amount,kind,funding) VALUES(?,?,?,?,?,?,?,?,?,?)', [id,customer.id,email,pkg.id,JSON.stringify(pkg),account.userId,row.merchant_key_encrypted,pkg.price,kind,'qris']);
  try {
    const result = await merchantRequest('/api/payment/generate-qris', account.key, { method: 'POST', body: { amount: pkg.price, order_id: id } });
    const payment = validPayment(result, row);
    await merchantDb().execute('UPDATE bridge_checkout SET state=?,payment_json=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?', [payment.status,JSON.stringify(payment),id]);
    return { id, payment };
  } catch (error) {
    // Preserve a real but uncertain order for reconciliation; never create another charge on timeout.
    await merchantDb().execute('UPDATE bridge_checkout SET state=\'unknown\',updated_at=UTC_TIMESTAMP(6) WHERE id=?', [id]);
    return { id, payment: { order_id:id,amount:pkg.price,status:'unknown',message:'Respons provider belum dapat dipastikan. Gunakan pemeriksaan status; jangan membuat pembayaran ulang.' } };
  }
}
export function authorizeCheckout(row, customer, legacyToken) {
  if (!customer?.id) throw fail(401, 'Masuk ke akun AXIOM untuk membuka invoice.', 'customer_login_required');
  if (!row) throw fail(404, 'Pesanan tidak ditemukan.', 'not_found');
  if (row.customer_id) {
    if (row.customer_id !== customer.id) throw fail(404, 'Pesanan tidak ditemukan.', 'not_found');
    return false;
  }
  // Migrate a pre-account invoice only through its original secret, never by matching an email.
  if (!/^[A-Za-z0-9_-]{43}$/.test(legacyToken || '') || !sameSecret(row.token_hash,hashToken(legacyToken))) throw fail(404, 'Akses invoice lama tidak tersedia pada sesi ini.', 'not_found');
  return true;
}

export async function customerOrders(customer) {
  if (!customer?.id) throw fail(401, 'Masuk ke akun AXIOM untuk melihat pesanan.', 'customer_login_required');
  // ponytail: latest 100 invoices; add cursor pagination when customers need older history.
  const [rows] = await merchantDb().execute('SELECT id,amount,state,created_at,package_snapshot,api_key_id,kind,funding,wallet_credited FROM bridge_checkout WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 100',[customer.id]);
  return {orders:rows.map(row=>({id:row.id,amount:Number(row.amount),state:row.state,kind:row.kind,funding:row.funding,created_at:row.created_at,packageName:decodeJson(row.package_snapshot).name,fulfilled:row.kind==='topup'?!!row.wallet_credited:!!row.api_key_id}))};
}

export async function reconcileCheckout(id, customer, { cancel = false, trusted = false, legacyToken = null } = {}) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw fail(404, 'Pesanan tidak ditemukan.', 'not_found');
  const db = await merchantDb().getConnection();
  try {
    await db.beginTransaction();
    const [[row]] = await db.execute('SELECT * FROM bridge_checkout WHERE id=? FOR UPDATE', [id]);
    if (!row) throw fail(404, 'Pesanan tidak ditemukan.', 'not_found');
    if (!trusted && authorizeCheckout(row,customer,legacyToken)) {
      await db.execute('UPDATE bridge_checkout SET customer_id=?,token_hash=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[customer.id,id]);
      row.customer_id=customer.id;
    }
    let payment = row.payment_json ? decodeJson(row.payment_json) : null;
    if (row.state === 'settlement' && (row.api_key_id || row.kind==='topup'&&row.wallet_credited)) { await db.commit(); return customerView(row,payment); }
    if (row.funding === 'wallet') {
      if (row.state!=='settlement'||row.kind!=='package') throw fail(409,'Debit saldo belum dikonfirmasi.','wallet_payment_unverified');
      const [[debit]]=await db.execute('SELECT customer_id,amount FROM bridge_wallet_entries WHERE reference=? AND kind=?',[row.id,'purchase']);
      if(!debit||debit.customer_id!==row.customer_id||Number(debit.amount)!==-Number(row.amount))throw fail(409,'Debit saldo tidak cocok dengan pesanan.','wallet_payment_unverified');
      row.api_key_id=fulfill(row);
      await db.execute('UPDATE bridge_checkout SET api_key_id=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[row.api_key_id,id]);
      await db.commit();return customerView(row,payment);
    }
    const key = unseal(row.merchant_key_encrypted);
    payment = validPayment(await merchantRequest('/api/payment/status/' + id,key), row);
    if (cancel && payment.status === 'pending') payment = validPayment(await merchantRequest('/api/payment/cancel/' + id,key,{method:'POST',body:{}}),row);
    // A confirmed settlement wins a race with cancel. Only provider-confirmed settlement issues the key.
    if (payment.status === 'settlement') {
      if(row.kind==='topup') {
        await applyWalletEntry(db,row.customer_id,row.id,'topup',Number(row.amount));
        row.wallet_credited=true;
      } else row.api_key_id = fulfill(row);
    }
    if (row.state === 'settlement' && payment.status !== 'settlement') throw fail(409,'Pembayaran sudah tercatat lunas.','settled');
    row.state = payment.status;
    await db.execute('UPDATE bridge_checkout SET state=?,payment_json=?,api_key_id=?,wallet_credited=?,paid_at=CASE WHEN ?=\'settlement\' THEN COALESCE(paid_at,UTC_TIMESTAMP(6)) ELSE paid_at END,updated_at=UTC_TIMESTAMP(6) WHERE id=?', [payment.status,JSON.stringify(payment),row.api_key_id || null,!!row.wallet_credited,payment.status,id]);
    await db.commit();
    return customerView(row,payment);
  } catch(error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
