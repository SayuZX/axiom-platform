// JavaScript, customer-wallet-store.mjs, Node.js24/MariaDB: transaction-owned integer IDR ledger.
import { fail } from './merchant-http.mjs';

export async function applyWalletEntry(db,customerId,reference,kind,amount) {
  if(!customerId||!['topup','purchase'].includes(kind)||!Number.isSafeInteger(amount)||amount===0||(kind==='topup'&&amount<0)||(kind==='purchase'&&amount>0))throw fail(500,'Mutasi saldo tidak valid.','wallet_invalid');
  await db.execute('INSERT IGNORE INTO bridge_wallets(customer_id,balance,updated_at) VALUES(?,0,UTC_TIMESTAMP(6))',[customerId]);
  const [[wallet]]=await db.execute('SELECT balance FROM bridge_wallets WHERE customer_id=? FOR UPDATE',[customerId]);
  const [[existing]]=await db.execute('SELECT customer_id,kind,amount,balance_after FROM bridge_wallet_entries WHERE reference=?',[reference]);
  if(existing){
    if(existing.customer_id!==customerId||existing.kind!==kind||Number(existing.amount)!==amount)throw fail(409,'Referensi saldo tidak cocok.','wallet_conflict');
    return Number(existing.balance_after);
  }
  const balance=Number(wallet.balance)+amount;
  if(!Number.isSafeInteger(balance)||balance>1000000000000)throw fail(409,'Batas saldo terlampaui.','wallet_limit');
  if(balance<0)throw fail(409,'Saldo tidak cukup. Isi saldo atau pilih pembayaran QRIS.','insufficient_balance');
  await db.execute('UPDATE bridge_wallets SET balance=?,updated_at=UTC_TIMESTAMP(6) WHERE customer_id=?',[balance,customerId]);
  await db.execute('INSERT INTO bridge_wallet_entries(customer_id,reference,kind,amount,balance_after,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP(6))',[customerId,reference,kind,amount,balance]);
  return balance;
}
