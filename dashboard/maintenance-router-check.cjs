const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const source = fs.readFileSync(process.argv[2], 'utf8');
const start = source.indexOf('    const modelDiscovery =');
const end = source.indexOf("    if (pathname === '/dashboard/billing'", start);
assert(start > 0 && end > start);
const guard = source.slice(start, end);
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE apiKeys (key TEXT, id TEXT, isActive INTEGER, expiresAt TEXT)');
const insert = db.prepare('INSERT INTO apiKeys VALUES (?, ?, ?, ?)');
const defaultId = '8a2d3170-4eee-40bf-ba95-e7bcdfca4be1';
for (const row of [['default',defaultId,1,null],['other','other-id',1,null],['disabled',defaultId,0,null],['expired',defaultId,1,'2000-01-01'],['bad-expiry',defaultId,1,'invalid']]) insert.run(...row);
function call(pathname, enabled, key, method = 'POST', model = 'ax/gpt-6-astra') {
  let status = 200, headers, body;
  const context = { pathname, accountDb: db, req: { method, headers: key ? { authorization: 'Bearer '+key } : {}, body: {model} }, process: { env: {} }, fs: { readFileSync: () => JSON.stringify({enabled,message:'Scheduled maintenance',retryAfter:90}) }, res: {writeHead(s,h){status=s;headers=h;},end(b){body=b;} } };
  vm.runInNewContext('(function(){'+guard+'})()', context);
  return {status,headers,body};
}
for (const route of ['/v1/chat/completions','/api/v1/responses','/v1beta/models','/responses','/codex/responses']) {
  for (const key of [undefined,'arbitrary','other','disabled','expired','bad-expiry']) {
    const result=call(route,true,key); assert.equal(result.status,503); assert.equal(result.headers['Retry-After'],'90'); assert.equal(JSON.parse(result.body).error.code,'maintenance');
  }
  for (const model of ['ax/gpt-6-astra','cx/gpt-6-astra']) assert.equal(call(route,true,'default','POST',model).status,200);
  assert.equal(call(route,false).status,200);
}
for(const route of ['/login','/api/auth/login','/dashboard','/merchant-api/webhook']) assert.equal(call(route,true).status,200);
for(const method of ['GET','HEAD']) assert.equal(call('/v1/models',true,undefined,method).status,200);
db.close();
console.log('PASS maintenance: authenticated active default only, AX/native prefixes, discovery and recovery');
