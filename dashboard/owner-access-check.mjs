// JavaScript, owner-access-check.mjs, Node.js 24: anonymous buyer/admin isolation on a running site.
import assert from 'node:assert/strict';
const origin = process.env.AXIOM_CHECK_ORIGIN || 'http://127.0.0.1:3001';
const post = body => ({method:'POST',headers:{Origin:'https://ai.axiomcreative.xyz','Content-Type':'application/json'},body:JSON.stringify(body)});
for (const [route,options] of [['session',{}],['admin/status',{}],['history',{}],['balance',{}],['login/start',post({email:'owner@example.invalid'})],['login/continue',post({otp:'123456'})],['admin/select',post({})],['payments',post({amount:1000,order_id:'00000000-0000-4000-8000-000000000002'})]]) {
  const response=await fetch(origin+'/merchant-api/'+route,options);
  assert.equal(response.status,401,route);
  assert.equal((await response.json()).code,'admin_required',route);
}
for (const [route,options] of [['billing/stats',{}],['billing/packages',{}],['billing/orders',{}],['billing/keys',{}],['billing/packages',post({name:'forbidden'})],['billing/keys/forbidden',post({isActive:false})],['billing/orders/forbidden/sync',post({})]]) {
  const response=await fetch(origin+'/merchant-api/'+route,options);
  assert.equal(response.status,401,route);assert.equal((await response.json()).code,'admin_required',route);
}
const packages=await fetch(origin+'/commerce-api/packages');assert.equal(packages.status,200);
const catalog=await packages.json();assert.equal(typeof catalog.configured,'boolean');
assert.ok(Array.isArray(catalog.packages));
for (const route of ['/merchant','/merchant/login','/manage/api-sales','/manage/billing','/manage/models','/manage/pricing']) {
  const response=await fetch(origin+route,{redirect:'manual'});
  assert.equal(response.status,307,route);assert.equal(new URL(response.headers.get('location'),origin).pathname,'/login');
}
for(const [path,options] of [['orders',post({package_id:'any',email:'spoof@example.invalid'})],['orders',{}],['orders/00000000-0000-4000-8000-000000000000',{}]]) {
  const response=await fetch(origin+'/commerce-api/'+path,options);
  assert.equal(response.status,401);assert.equal((await response.json()).code,'customer_login_required');
}
for(const path of ['/customer-api/overview','/customer-api/logs','/customer-api/performance','/customer-api/keys','/customer-api/status','/wallet-api/summary']) {
  const response=await fetch(origin+path);assert.equal(response.status,401,path);
}
console.log('PASS: merchant administration requires native admin; purchases and invoices require customer login; catalogue remains public.');
