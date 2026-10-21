// JavaScript, customer-wallet.mjs, Node.js24: customer credits and idempotent package purchase.
import { merchantDb } from './merchant-store.mjs';
import { routerDb, packageSnapshot, reconcileCheckout } from './merchant-commerce.mjs';
import { applyWalletEntry } from './customer-wallet-store.mjs';
import { fail } from './merchant-http.mjs';

export async function walletSummary(customer) {
  const db=merchantDb();
  const [[wallet]]=await db.execute('SELECT balance FROM bridge_wallets WHERE customer_id=?',[customer.id]);
  const [transactions]=await db.execute('SELECT id,reference,kind,amount,balance_after,created_at FROM bridge_wallet_entries WHERE customer_id=? ORDER BY id DESC LIMIT 100',[customer.id]);
  const [pending]=await db.execute("SELECT id,amount,state,created_at FROM bridge_checkout WHERE customer_id=? AND kind='topup' AND state IN ('creating','unknown','pending') ORDER BY created_at DESC LIMIT 20",[customer.id]);
  return {balance:Number(wallet?.balance||0),currency:'IDR',transactions:transactions.map(r=>({...r,id:String(r.id),amount:Number(r.amount),balance_after:Number(r.balance_after)})),pending_topups:pending.map(r=>({...r,amount:Number(r.amount)}))};
}
export async function purchaseWithWallet(input,customer) {
  const id=input.request_id;
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id||''))throw fail(400,'ID pembelian diperlukan.','invalid_purchase');
  if(typeof input.package_id!=='string'||input.package_id.length>128)throw fail(400,'Paket tidak valid.','invalid_package');
  const db=await merchantDb().getConnection();let confirmedPayment;
  try{
    await db.beginTransaction();
    // Serializes spending and the same request ID before reserving/issuing a key.
    await db.execute('INSERT IGNORE INTO bridge_wallets(customer_id,balance,updated_at) VALUES(?,0,UTC_TIMESTAMP(6))',[customer.id]);
    await db.execute('SELECT balance FROM bridge_wallets WHERE customer_id=? FOR UPDATE',[customer.id]);
    const [[existing]]=await db.execute('SELECT customer_id,package_id,funding,state,payment_json FROM bridge_checkout WHERE id=?',[id]);
    if(existing){
      if(existing.customer_id!==customer.id||existing.package_id!==input.package_id||existing.funding!=='wallet'||existing.state!=='settlement')throw fail(409,'ID pembelian sudah terpakai.','purchase_conflict');
      confirmedPayment=typeof existing.payment_json==='string'?JSON.parse(existing.payment_json):existing.payment_json;
    }else{
      const pkg=packageSnapshot(routerDb().prepare('SELECT * FROM tokenPackages WHERE id=?').get(input.package_id));
      if(!pkg)throw fail(404,'Paket tidak tersedia.','package_unavailable');
      await applyWalletEntry(db,customer.id,id,'purchase',-pkg.price);
      const payment={order_id:id,transaction_id:'wallet:'+id,amount:pkg.price,currency:'IDR',status:'settlement',source:'wallet',created_at:new Date().toISOString()};
      confirmedPayment=payment;
      await db.execute("INSERT INTO bridge_checkout(id,customer_id,email,package_id,package_snapshot,amount,kind,funding,state,payment_json,paid_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'package','wallet','settlement',?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))",[id,customer.id,customer.email,pkg.id,JSON.stringify(pkg),pkg.price,JSON.stringify(payment)]);
    }
    await db.commit();
  }catch(error){await db.rollback();throw error;}finally{db.release();}
  // Debit is durable before SQLite issuance. A retry/status check resumes, never debits twice.
  try{return await reconcileCheckout(id,customer);}
  catch(error){if(error.status&&error.status<500)throw error;return {id,fulfilled:false,kind:'package',funding:'wallet',payment:confirmedPayment,message:'Saldo sudah didebit. Buka pesanan ini untuk menyelesaikan penerbitan key; jangan membuat pembelian baru.'};}
}
