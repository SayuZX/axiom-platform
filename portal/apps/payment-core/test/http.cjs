const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {DatabaseSync} = require('node:sqlite');
const {scryptSync,createHash} = require('node:crypto');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'axiom-ruby-check-'));
const messages=[]; const orders=new Map(); let rejectMail=false; let child; let db;
const smtp=net.createServer(socket=>{socket.on('error',()=>{});socket.write('220 test ESMTP\r\n');let buffer='',data=false,message='';socket.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2);if(data){if(line==='.'){data=false;if(!rejectMail)messages.push(message);message='';socket.write(rejectMail?'451 Temporary failure\r\n':'250 Queued\r\n');}else message+=line+'\n';}else if(/^EHLO/.test(line))socket.write('250-test\r\n250 8BITMIME\r\n');else if(line==='DATA'){data=true;socket.write('354 Send\r\n');}else if(line==='QUIT')socket.end('221 Bye\r\n');else socket.write('250 OK\r\n');}});});
const bridge=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/merchant/user-config')return res.end(JSON.stringify({merchant:{id:'test-merchant'}}));if(req.method==='POST'){let body='';for await(const c of req)body+=c;const b=JSON.parse(body);const row={order_id:b.order_id,transaction_id:'provider-'+b.order_id,amount:b.amount,currency:'IDR',status:'pending',qr_string:'00020101021254051000063040000',expires_at:new Date(Date.now()+900000).toISOString()};orders.set(b.order_id,row);return res.end(JSON.stringify(row));}const row=orders.get(decodeURIComponent(req.url.split('/').at(-1)));res.statusCode=row?200:404;res.end(JSON.stringify(row||{}));});
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;}
function mailText(message){const [headers,...body]=message.split('\n\n');return headers+'\n'+(/Content-Transfer-Encoding: base64/i.test(headers)?Buffer.from(body.join('\n\n').trim(),'base64').toString('utf8'):body.join('\n\n'));}
async function main(){
 const smtpPort=await listen(smtp),bridgePort=await listen(bridge);const reserve=net.createServer();const port=await listen(reserve);await new Promise(r=>reserve.close(r));const origin=`http://127.0.0.1:${port}`;
 fs.writeFileSync(path.join(directory,'merchant.json'),JSON.stringify({merchant_id:'test-merchant',key:'local-test-merchant-key-only'}));
 const policy={operator_name:'Fixture operator',correspondence_address:'Fixture address, not public',contact_email:'support@example.test',privacy_email:'privacy@example.test',support_hours:'Fixture hours',withdrawal_schedule:'Fixture schedule',retention_accounts:'Fixture retention',retention_financial:'Fixture retention',retention_support:'Fixture retention',retention_logs:'Fixture retention',version:'test-1',effective_at:'2026-10-10',updated_at:'2026-10-10'};
 fs.writeFileSync(path.join(directory,'policy.json'),JSON.stringify(policy));
 const core=path.resolve(__dirname,'..');
 const env={...process.env,BUNDLE_GEMFILE:path.join(core,'Gemfile'),RACK_ENV:'test',NODE_ENV:'test',API_KEY:'test-master-key-not-a-production-secret',DATA_DIR:directory,PUBLIC_URL:origin,HOST:'127.0.0.1',PORT:String(port),SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtpPort),SMTP_FROM:'noreply@example.test',SMTP_SECURE:'false',EMAIL_DELIVERY_ENABLED:'true',GOPAY_MERCHANT_ID:'test-merchant',MERCHANT_BRIDGE_URL:`http://127.0.0.1:${bridgePort}`,MERCHANT_CONNECTION_FILE:path.join(directory,'merchant.json')};
 env.POLICY_CONFIG_FILE=path.join(directory,'policy.json');env.POLICIES_PUBLISHED='true';
 env.TELEGRAM_MODE='webhook';env.TELEGRAM_WEBHOOK_SECRET='test-webhook-secret-with-at-least-32-characters';
 child=spawn(process.env.RUBY||'ruby',[path.join(core,'bin/api')],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('Ruby startup timeout: '+logs)),15000);child.once('exit',code=>{clearTimeout(deadline);reject(new Error('Ruby exited '+code+': '+logs));});const check=async()=>{try{const r=await fetch(origin+'/health');if(r.ok){clearTimeout(deadline);return resolve();}}catch{}setTimeout(check,100).unref();};check();});
 db=new DatabaseSync(path.join(directory,'payments.sqlite'));
 async function request(url,{method='GET',body,cookie,key,headers={}}={}){const r=await fetch(origin+url,{method,headers:{'Content-Type':'application/json',Origin:origin,'X-Axiom-Request':'1',...(cookie?{Cookie:cookie}:{}),...(key?{'x-api-key':key}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const shortPassword='garuda45';
 assert.equal((await request('/api/auth/register',{method:'POST',body:{username:'short_pw',email:'short@example.test',password:shortPassword,accept_tos:true,tos_version:'test-1'}})).status,400);
 const password='Sandi-kuat-12345';
 const salt='0123456789abcdef0123456789abcdef'; const hash=scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');db.prepare('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at,role) VALUES(?,?,?,?,?,?,?)').run('legacy','legacy','legacy@example.test',hash,salt,Date.now(),'admin');
 const login=await request('/api/auth/login',{method:'POST',body:{username:'legacy',password}});assert.equal(login.status,200,'legacy scrypt login');const admin=login.cookie;
 const reg=await request('/api/auth/register',{method:'POST',body:{username:'alice',email:'alice@example.test',password,accept_tos:true,tos_version:'test-1'}});assert.equal(reg.status,202,JSON.stringify(reg.body));const token=reg.body.data.registration_id;const otp=mailText(messages.at(-1)).match(/Anda: (\d{6})/)[1];assert.equal(JSON.stringify(reg.body).includes(otp),false);
 assert.equal((await request('/api/auth/verify',{method:'POST',body:{registration_id:token,otp:otp==='000000'?'000001':'000000'}})).status,400);
 const verified=await request('/api/auth/verify',{method:'POST',body:{registration_id:token,otp}});assert.equal(verified.status,201);const cookie=verified.cookie;const user=verified.body.data.user;assert.equal(user.role,'customer');
 assert.equal((await request('/api/auth/verify',{method:'POST',body:{registration_id:token,otp}})).status,400);
 assert.equal(db.prepare('SELECT version FROM policy_consents WHERE customer_id=?').get(user.id).version,'test-1');
 assert.equal((await request('/api/keys',{method:'POST',cookie,body:{name:'csrf',password},headers:{Origin:'https://evil.test'}})).status,403);
 assert.equal((await request('/api/keys',{method:'POST',cookie,body:{name:'missing-verification'}})).status,401);
 assert.equal((await request('/api/payments',{cookie,key:'invalid'})).status,401);
 assert.equal((await request('/api/admin/overview',{key:env.API_KEY})).status,401);
 assert.equal((await request('/api/admin/customers?search=alice',{cookie:admin})).body.data.customers[0].id,user.id);
 assert.equal((await request('/api/admin/customers?search=%25',{cookie:admin})).body.data.total,0);
 db.prepare("UPDATE customers SET role='customer' WHERE id='legacy'").run();assert.equal((await request('/api/admin/overview',{cookie:admin})).status,403);db.prepare("UPDATE customers SET role='admin' WHERE id='legacy'").run();
 assert.equal((await request('/api/telegram/webhook',{method:'POST',body:{update_id:987,message:{text:'/saldo'}},headers:{'X-Telegram-Bot-Api-Secret-Token':'fake'}})).status,403);
 const webhookBody={update_id:987,message:{from:{id:101},chat:{id:101,type:'private'},text:'/saldo'}};
 for(let i=0;i<2;i++)assert.equal((await request('/api/telegram/webhook',{method:'POST',body:webhookBody,headers:{'X-Telegram-Bot-Api-Secret-Token':env.TELEGRAM_WEBHOOK_SECRET}})).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM telegram_updates WHERE update_id=987').get().n,1);
 const key=await request('/api/keys',{method:'POST',cookie,body:{name:'check',password}});assert.equal(key.status,201);
 if(process.argv.includes('keys')) {
  const keyId=key.body.data.key.id,secret=key.body.data.secret,limitUrl=`/api/admin/customers/${user.id}/api-key-limit`;
  const changeLimit=async(value,actor=admin)=>{db.prepare('DELETE FROM auth_limits').run();return request(limitUrl,{method:'POST',cookie:actor,body:{max_active_api_keys:value,password}});};
  assert.equal((await changeLimit(0,cookie)).status,403);
  assert.equal((await request(limitUrl,{method:'POST',key:env.API_KEY,body:{max_active_api_keys:0,password}})).status,401);
  assert.equal((await request(limitUrl,{method:'POST',cookie:admin,body:{max_active_api_keys:0}})).status,401);
  for(const value of [null,true,'2',1.5,-1,101]) assert.equal((await changeLimit(value)).status,400);
  assert.equal((await changeLimit(0)).status,200);
  assert.equal((await request('/api/keys',{method:'POST',cookie,body:{name:'blocked',password}})).status,409);
  assert.equal((await request('/api/payments',{key:secret})).status,200,'limit reduction must not revoke');
  assert.equal((await request(`/api/keys/${keyId}`,{method:'DELETE',cookie:admin})).status,404);
  assert.equal((await request(`/api/keys/${keyId}/remove`,{method:'POST',cookie:admin})).status,404);
  assert.equal((await request(`/api/keys/${keyId}/remove`,{method:'POST',cookie})).status,409);
  assert.equal((await request(`/api/keys/${keyId}/remove`,{method:'POST',cookie,headers:{Origin:'https://evil.test'}})).status,403);
  assert.equal((await request(`/api/keys/${keyId}`,{method:'DELETE',cookie})).status,200);
  assert.equal((await request(`/api/keys/${keyId}/remove`,{method:'POST',cookie})).status,200);
  const listing=await request('/api/keys',{cookie});assert.deepEqual(listing.body.data,{keys:[],usage:{active:0,limit:0}});
  assert.equal((await request('/api/payments',{key:secret})).status,401);
  assert.ok(db.prepare('SELECT deleted_at,revoked_at FROM customer_keys WHERE id=?').get(keyId).deleted_at);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM action_audit WHERE resource_id=?').get(keyId).n,3);
  assert.equal(JSON.stringify((await request('/api/keys',{cookie:admin})).body).includes(secret),false);
  assert.equal((await changeLimit(1)).status,200);
  assert.equal((await request('/api/keys',{method:'POST',cookie,body:{name:'replacement',password}})).status,201);
  console.log('PASS: HTTP API key limit authorization, validation, revocation compatibility, tombstone isolation and credential rejection');return;
 }
 if(process.argv.includes('auth')){assert.equal((await request('/api/keys/'+key.body.data.key.id,{method:'DELETE',cookie})).status,200);assert.equal((await request('/api/me',{cookie:admin})).body.data.user.username,'legacy');console.log('PASS: Ruby HTTP legacy scrypt, SMTP OTP, verification/reuse, session, key lifecycle');return;}
 assert.equal((await request('/api/admin/overview',{cookie})).status,403);
 const legacy={id:'old-invoice',trx:'AXP-old'};db.prepare('INSERT INTO payments(id,trx_id,amount,qr,created_at,expires_at,status,customer_id,fee_rate_bps,fee_amount,fee_policy) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(legacy.id,legacy.trx,100000,'000201',Date.now(),Date.now()+900000,'PENDING',user.id,100,1000,'percentage_100bps');orders.set(legacy.trx,{order_id:legacy.trx,transaction_id:'provider-old',amount:100000,currency:'IDR',status:'settlement',expires_at:new Date(Date.now()+900000).toISOString()});
 for(let i=0;i<2;i++){const historical=(await request('/check-payment?qris_id='+legacy.id,{cookie})).body;assert.deepEqual([historical.data.fee_amount,historical.data.net_amount,historical.data.fee_rate_bps,historical.data.fee_policy],[1000,99000,100,'percentage_100bps']);assert.deepEqual([historical.transaction.fee_amount,historical.transaction.net_amount],[1000,99000]);}
 const fixed={id:'old-fixed-invoice',trx:'AXP-old-fixed'};db.prepare('INSERT INTO payments(id,trx_id,amount,qr,created_at,expires_at,status,customer_id,fee_rate_bps,fee_amount,fee_policy) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(fixed.id,fixed.trx,100000,'000201',Date.now(),Date.now()+900000,'PENDING','legacy',0,2500,'fixed_2500');orders.set(fixed.trx,{order_id:fixed.trx,transaction_id:'provider-old-fixed',amount:100000,currency:'IDR',status:'settlement',expires_at:new Date(Date.now()+900000).toISOString()});
 for(let i=0;i<2;i++){const historical=(await request('/check-payment?qris_id='+fixed.id,{cookie:admin})).body;assert.deepEqual([historical.data.fee_amount,historical.data.net_amount,historical.data.fee_rate_bps,historical.data.fee_policy],[2500,97500,0,'fixed_2500']);assert.deepEqual([historical.transaction.fee_amount,historical.transaction.net_amount],[2500,97500]);}
 assert.equal((await request('/create-qris',{method:'POST',cookie,body:{amount:100000}})).status,401);
 for(const amount of [0,-1,1.5,10000001]){db.prepare('DELETE FROM auth_limits').run();assert.equal((await request('/create-qris',{method:'POST',cookie,body:{amount,password}})).status,400);}
 for(const [amount,fee,net] of [[1,0,1],[49,0,49],[50,1,49],[51,1,50],[2499,49,2450],[2500,50,2450],[10000000,200000,9800000]]){
  db.prepare('DELETE FROM auth_limits').run();const response=await request('/create-qris',{method:'POST',cookie,body:{amount,password}});assert.equal(response.status,200,JSON.stringify(response.body));const invoice=response.body.data;
  assert.deepEqual([invoice.amount,invoice.fee_amount,invoice.net_amount,invoice.fee_rate_bps,invoice.fee_policy],[amount,fee,net,200,'percentage_200bps']);const stored=db.prepare('SELECT amount,fee_amount,fee_rate_bps,fee_policy FROM payments WHERE id=?').get(invoice.qris_id);assert.deepEqual([stored.amount,stored.fee_amount,stored.fee_rate_bps,stored.fee_policy],[amount,fee,200,'percentage_200bps']);
 }
 db.prepare('DELETE FROM auth_limits').run();const created=await request('/create-qris',{method:'POST',cookie,body:{amount:100000,fee_amount:0,fee_rate_bps:0,fee_policy:'fixed_2500',net_amount:100000,password}});assert.equal(created.status,200);const payment=created.body.data;assert.deepEqual([payment.fee_amount,payment.net_amount],[2000,98000]);
 const receiptPath='/api/receipts/payment/'+payment.qris_id+'.png';
 assert.equal((await request(receiptPath)).status,401);
 assert.equal((await request(receiptPath,{key:env.API_KEY})).status,401);
 assert.equal((await request(receiptPath,{cookie})).status,409);
 assert.equal((await request(receiptPath,{cookie:admin})).status,409);
 assert.equal((await request('/api/receipts/payment/'+fixed.id+'.png',{cookie})).status,404);
 const publicFields=['amount','expires_at','qris_id','status','trx_id'];
 function publicReceipt(response,status,success=true){assert.equal(response.body.success,success);assert.equal(response.body.status,status);assert.equal(response.body.paid,success&&status==='PAID');assert.deepEqual(Object.keys(response.body).sort(),(success?['data','paid','status','success']:['data','message','paid','status','success']).sort());assert.deepEqual(Object.keys(response.body.data).sort(),publicFields);assert.deepEqual(response.body.data,{qris_id:payment.qris_id,trx_id:payment.trx_id,amount:100000,status,expires_at:payment.expires_at});}
 function privateFees(data){assert.deepEqual([data.fee_amount,data.net_amount,data.fee_rate_bps,data.fee_policy],[2000,98000,200,'percentage_200bps']);}
 publicReceipt(await request('/api/qr-status/'+payment.qris_id),'PENDING');
 publicReceipt(await request('/api/qr-status/'+payment.qris_id,{cookie}),'PENDING');
 privateFees((await request('/api/payments/'+payment.qris_id,{cookie})).body.data.payment);
 privateFees((await request('/api/payments/'+payment.qris_id,{key:key.body.data.secret})).body.data.payment);
 for(const method of ['GET','POST'])assert.equal((await request('/check-payment?qris_id='+payment.qris_id,{method})).status,401);
 assert.equal((await fetch(origin+'/api/qr-image/'+payment.qris_id)).status,200);
 assert.equal((await request('/api/payments/'+payment.qris_id,{cookie:admin})).status,404);
 assert.equal((await request('/api/admin/payments?search='+payment.trx_id,{cookie:admin})).body.data.payments[0].qris_id,payment.qris_id);
 privateFees((await request('/api/admin/payments?search='+payment.trx_id,{cookie:admin})).body.data.payments[0]);
 assert.equal((await request('/api/payments?search=%25',{cookie})).body.data.total,0);
 const provider=orders.get(payment.trx_id);const original={...provider};
 for(const mutation of [{order_id:'wrong'},{amount:1},{currency:'USD'},{transaction_id:'foreign'},{status:'refund'}]){Object.assign(provider,original,mutation);assert.equal((await request('/check-payment?qris_id='+payment.qris_id,{cookie})).status,502);}
 const publicError=await request('/api/qr-status/'+payment.qris_id);assert.equal(publicError.status,502);publicReceipt(publicError,'PENDING',false);
 Object.assign(provider,original);
 orders.get(payment.trx_id).status='settlement';for(let i=0;i<2;i++)assert.equal((await request('/check-payment?qris_id='+payment.qris_id,{cookie})).body.paid,true);
 publicReceipt(await request('/api/qr-status/'+payment.qris_id),'PAID');
 publicReceipt(await request('/api/qr-status/'+payment.qris_id,{cookie:admin}),'PAID');
 const paidPrivate=await request('/check-payment?qris_id='+payment.qris_id,{cookie});privateFees(paidPrivate.body.data);privateFees(paidPrivate.body.transaction);assert.equal(paidPrivate.body.transaction.transaction_id,provider.transaction_id);
 if(process.platform==='win32'){
  for(const auth of [cookie,admin]){
   const receipt=await fetch(origin+receiptPath+'?download=1',{headers:{Cookie:auth}});
   assert.equal(receipt.status,200);assert.equal(receipt.headers.get('content-type'),'image/png');
   assert.match(receipt.headers.get('cache-control'),/no-store/);assert.match(receipt.headers.get('content-disposition'),/^attachment/);
   assert.equal(Buffer.from(await receipt.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }
 }
 privateFees((await request('/api/admin/payments?search='+payment.trx_id,{cookie:admin})).body.data.payments[0]);
 const paidPublicError=await request('/api/qr-status/'+payment.qris_id+'?amount=1');assert.equal(paidPublicError.status,400);publicReceipt(paidPublicError,'PAID',false);
 assert.equal((await fetch(origin+'/api/qr-image/'+payment.qris_id)).status,410);
 const expired=await request('/create-qris',{method:'POST',cookie,body:{amount:100000,password}});assert.equal(expired.status,200);orders.get(expired.body.data.trx_id).status='expire';
 const expiredPublic=await request('/api/qr-status/'+expired.body.data.qris_id);assert.equal(expiredPublic.body.status,'EXPIRED');assert.deepEqual(Object.keys(expiredPublic.body.data).sort(),publicFields);assert.equal('transaction' in expiredPublic.body,false);assert.equal((await fetch(origin+'/api/qr-image/'+expired.body.data.qris_id)).status,410);
 const wallet=(await request('/api/wallet',{cookie})).body.data.wallet;assert.equal(wallet.available_amount,197000);
 assert.equal((await request('/api/withdrawal-destinations')).status,401);
 const destinations=(await request('/api/withdrawal-destinations',{cookie})).body.data.groups;
 assert.ok(destinations.some(group=>group.kind==='wallet'&&group.names.includes('DANA')));
 assert.ok(destinations.some(group=>group.kind==='bank'&&group.names.includes('BCA')));
 const body={amount:100000,bank_name:'BCA',account_number:'0012345678',account_holder:'Alice Test',request_id:'request-test-00000001',expected_customer_id:user.id,password};
 assert.equal((await request('/api/withdrawals',{method:'POST',cookie,body:{...body,password:undefined}})).status,401);
 const w=await request('/api/withdrawals',{method:'POST',cookie,body});assert.equal(w.status,201);const wid=w.body.data.withdrawal.id;
 assert.equal((await request('/api/withdrawals',{method:'POST',cookie,body})).body.data.withdrawal.id,wid);assert.equal((await request('/api/wallet',{cookie})).body.data.wallet.available_amount,97000);
 assert.equal((await request('/api/admin/withdrawals/'+wid+'/status',{method:'POST',cookie:admin,body:{status:'PROCESSING',password}})).status,200);
 assert.equal((await request('/api/admin/withdrawals/'+wid+'/status',{method:'POST',cookie:admin,body:{status:'REJECTED',rejection_reason:'Rekening perlu diperiksa',password}})).status,200);
 assert.equal((await request('/api/wallet',{cookie})).body.data.wallet.available_amount,197000);
 assert.equal((await request('/api/admin/commissions',{cookie:admin})).body.data.totals.fee_amount,5500);
 assert.equal((await request('/api/admin/audit',{cookie:admin})).body.data.events.length,3);
 db.prepare('DELETE FROM auth_limits').run();
 const parallel=await Promise.all(['parallel-request-001','parallel-request-002'].map(request_id=>request('/api/withdrawals',{method:'POST',cookie,body:{...body,amount:150000,request_id}})));
 assert.deepEqual(parallel.map(r=>r.status).sort(),[201,409]);
 const parallelId=parallel.find(r=>r.status===201).body.data.withdrawal.id;
 assert.equal((await request('/api/withdrawals/'+parallelId,{cookie:admin})).status,404);
 assert.equal((await request('/api/admin/withdrawals/'+parallelId+'/status',{method:'POST',cookie:admin,body:{status:'PAID',transfer_reference:'proof-test-001',confirm_transferred:true,password}})).status,409);
 assert.equal((await request('/api/admin/withdrawals/'+parallelId+'/status',{method:'POST',cookie:admin,body:{status:'PROCESSING',password}})).status,200);
 assert.equal((await request('/api/receipts/withdrawal/'+parallelId+'.png',{cookie})).status,409);
 for(let i=0;i<2;i++)assert.equal((await request('/api/admin/withdrawals/'+parallelId+'/status',{method:'POST',cookie:admin,body:{status:'PAID',transfer_reference:'proof-test-001',confirm_transferred:true,password}})).status,200);
 if(process.platform==='win32'){
  for(const auth of [cookie,admin]){
   const receipt=await fetch(origin+'/api/receipts/withdrawal/'+parallelId+'.png',{headers:{Cookie:auth}});
   assert.equal(receipt.status,200);assert.match(receipt.headers.get('cache-control'),/no-store/);
   assert.equal(Buffer.from(await receipt.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }
 }
 assert.equal((await request('/api/wallet',{cookie})).body.data.wallet.available_amount,47000);
 assert.equal((await request('/api/admin/withdrawals/'+parallelId+'/status',{method:'POST',cookie:admin,body:{status:'REJECTED',rejection_reason:'Cannot reverse terminal',password}})).status,409);
 db.prepare('DELETE FROM auth_limits').run();
 const resendReg=await request('/api/auth/register',{method:'POST',body:{username:'resender',email:'resender@example.test',password,accept_tos:true,tos_version:'test-1'}});assert.equal(resendReg.status,202);const oldOtp=mailText(messages.at(-1)).match(/Anda: (\d{6})/)[1];
 db.prepare('UPDATE registrations SET sent_at=? WHERE email=?').run(Date.now()-61000,'resender@example.test');db.prepare('DELETE FROM auth_limits').run();rejectMail=true;
 assert.equal((await request('/api/auth/resend',{method:'POST',body:{registration_id:resendReg.body.data.registration_id}})).status,503);rejectMail=false;
 assert.equal((await request('/api/auth/verify',{method:'POST',body:{registration_id:resendReg.body.data.registration_id,otp:oldOtp}})).status,201);
 if(process.argv.includes('finance')){console.log('PASS: Ruby HTTP percentage/legacy fees, ownership, settlement replay, withdrawal idempotency/reservation/rejection, commission snapshots and audit');return;}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM email_outbox WHERE event_key=?').get(`payment:${payment.qris_id}:PAID`).n,1);
 const worker=spawn(process.env.RUBY||'ruby',[path.join(core,'bin/worker'),'--once'],{env,stdio:['ignore','pipe','pipe']});let workerLog='';worker.stderr.on('data',c=>workerLog+=c);assert.equal((await once(worker,'exit'))[0],0,workerLog);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE state<>'accepted'").get().n,0);assert.ok(messages.some(m=>mailText(m).includes('98000')&&mailText(m).includes('alice@example.test')),'real SMTP receives transaction net amount');
 assert.equal((await request('/api/keys/'+key.body.data.key.id,{method:'DELETE',cookie})).status,200);assert.equal((await request('/api/payments',{key:key.body.data.secret})).status,401);
 console.log('PASS: Ruby HTTP legacy auth, OTP, role isolation, percentage/legacy fees, settlement replay, withdrawal reservation/rejection, commissions, audit, persistent email delivery, revoked key');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(child&&child.exitCode===null){child.kill();await once(child,'exit');}db?.close();smtp.close();bridge.close();fs.rmSync(directory,{recursive:true,force:true});});
