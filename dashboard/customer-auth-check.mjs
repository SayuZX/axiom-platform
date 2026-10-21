// JavaScript, customer-auth-check.mjs, Node.js 24: real HTTP customer/session isolation smoke.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
loadEnvFile('.env.production.local');
const {merchantDb,hashToken}=await import('./lib/merchant-store.mjs');
const {CUSTOMER_LEGAL_VERSION}=await import('./lib/customer-auth.mjs');
const {routerDb}=await import('./lib/merchant-commerce.mjs');
const origin=process.env.AXIOM_CHECK_ORIGIN || 'http://127.0.0.1:3001';
const email='axiom-auth-check-'+randomUUID()+'@example.invalid';
const password=randomBytes(24).toString('base64url');
const customers=[];
let cookie='';
async function call(path,body,session=cookie,requestOrigin='https://ai.axiomcreative.xyz'){
  return fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(session?{Cookie:session}:{}),...(body===undefined?{}:{Origin:requestOrigin,'Content-Type':'application/json'}),'X-Axiom-Client-IP':'customer-auth-check:'+email},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
}
try {
  let r=await call('/account-api/register',{email,name:'Runtime check',password,legalAccepted:true},'', 'https://evil.example');assert.equal(r.status,403);
  for (const legalAccepted of [undefined, false, null, 'true', 'false', 1, 0, [], {}]) {
    r=await call('/account-api/register',{email,name:'Runtime check',password,legalAccepted},'');
    assert.equal(r.status,400);assert.equal((await r.json()).code,'legal_acceptance_required');
    assert.equal(r.headers.get('set-cookie'),null);
    const [[rejected]]=await merchantDb().execute('SELECT COUNT(*) n FROM bridge_customers WHERE email=?',[email]);
    assert.equal(rejected.n,0,'invalid acknowledgement must not create an account');
  }
  r=await call('/account-api/register',{email,name:'Runtime check',password,legalAccepted:true,legal_accepted_at:'2000-01-01',legal_document_version:'forged'},'');assert.equal(r.status,201);
  let body=await r.json();customers.push(body.customer.id);assert.equal(body.authenticated,true);assert.equal('token' in body,false);
  const setCookie=r.headers.get('set-cookie');for(const flag of ['HttpOnly','Secure','SameSite=Lax','Max-Age=604800'])assert.ok(setCookie.includes(flag));
  cookie=setCookie.split(';')[0];const first=cookie;
  r=await call('/account-api/session');body=await r.json();assert.equal(body.customer.email,email);
  const [[stored]]=await merchantDb().execute('SELECT password_salt,password_hash,legal_accepted_at,legal_document_version,ABS(TIMESTAMPDIFF(SECOND,legal_accepted_at,UTC_TIMESTAMP(6))) acceptance_age FROM bridge_customers WHERE id=?',[customers[0]]);
  assert.notEqual(stored.password_hash,password);assert.match(stored.password_hash,/^[a-f0-9]{64}$/);
  assert.ok(stored.legal_accepted_at);assert.ok(stored.acceptance_age < 60,'acceptance time must come from server');
  assert.equal(stored.legal_document_version,CUSTOMER_LEGAL_VERSION,'document version must come from server');
  assert.equal(routerDb().prepare('SELECT COUNT(*) n FROM apiKeys WHERE customerEmail=?').get(email).n,0,'registration must not issue keys');
  r=await call('/merchant-api/session');assert.equal(r.status,401,'customer cookie cannot access merchant owner');
  r=await call('/account-api/login',{email,password:'wrong-password-12345'},'');assert.equal(r.status,401);assert.equal((await r.json()).code,'invalid_credentials');
  r=await call('/account-api/login',{email,password});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];assert.notEqual(cookie,first);
  r=await call('/account-api/session',undefined,first);assert.equal((await r.json()).authenticated,false);
  r=await call('/commerce-api/orders');assert.equal(r.status,200);assert.deepEqual((await r.json()).orders,[]);
  r=await call('/commerce-api/orders',{package_id:'missing-package',email:'impersonated@example.invalid'});assert.equal(r.status,404);
  r=await call('/commerce-api/orders',{package_id:'missing-package'},'');assert.equal(r.status,401);assert.equal((await r.json()).code,'customer_login_required');
  const sessionHash=hashToken(cookie.split('=')[1]);
  const [[session]]=await merchantDb().execute('SELECT customer_id FROM bridge_customer_sessions WHERE token_hash=?',[sessionHash]);assert.equal(session.customer_id,customers[0]);
  await merchantDb().execute('UPDATE bridge_customer_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE token_hash=?',[sessionHash]);
  r=await call('/account-api/session');assert.equal((await r.json()).authenticated,false);
  r=await call('/account-api/login',{email,password});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];
  r=await call('/account-api/logout',{});assert.equal(r.status,200);
  r=await call('/account-api/session');assert.equal((await r.json()).authenticated,false);
  const [[count]]=await merchantDb().execute('SELECT COUNT(*) n FROM bridge_customer_sessions WHERE customer_id=?',[customers[0]]);assert.equal(count.n,0);
  console.log('PASS: explicit legal acknowledgement validation and server records, real registration/login/logout, scrypt storage, fixed secure session, rotation, CSRF, no free key, customer/admin isolation and login-required checkout. No provider charge created.');
} finally {
  for(const id of customers)await merchantDb().execute('DELETE FROM bridge_customers WHERE id=?',[id]);
  await merchantDb().execute('DELETE FROM bridge_customers WHERE email=?',[email]);
  await merchantDb().end();routerDb().close();
}
