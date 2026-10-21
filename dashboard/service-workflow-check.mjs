import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { initializeAnnouncements, saveAnnouncement, listAnnouncements } from './lib/announcements.mjs';

const db = new DatabaseSync(':memory:');
const now = Date.now();
try {
  db.exec(`CREATE TABLE axiom_notices(notice_id TEXT PRIMARY KEY,enabled INTEGER,mode TEXT,target TEXT,target_group TEXT,event_type TEXT,priority INTEGER,start_at INTEGER,expires_at INTEGER,title TEXT,message TEXT);
    CREATE TABLE apiKeys(id TEXT,packageId TEXT,customerEmail TEXT);
    INSERT INTO apiKeys VALUES('owned','starter','owner@example.test');`);
  initializeAnnouncements(db);
  const base = {title:'Service update',slug:'service-update',category:'MAINTENANCE',summary:'Investigating service',content:'Admin update',version:'',status:'published',published_at:new Date(now-1000).toISOString(),expires_at:null,audience:'customers',is_pinned:false,publish_to_api:false,service_stage:'investigating'};
  let item = saveAnnouncement(db, base, now);
  const stored = () => db.prepare('SELECT stage,updated_at FROM axiom_announcement_progress WHERE id=?').get(item.id);
  assert.equal(item.service_stage, 'investigating');
  assert.equal(stored().updated_at, now);
  assert.equal(db.prepare('SELECT mode FROM axiom_notices WHERE notice_id=?').get(item.id).mode, 'disabled');
  assert.equal('service_stage' in listAnnouncements(db,'customers',now)[0], false);
  saveAnnouncement(db,{...item,title:'Edited title'},now+1);
  assert.equal(stored().updated_at, now);
  const {service_stage, ...omitted} = item;
  saveAnnouncement(db,omitted,now+2);
  assert.equal(stored().stage,'investigating');
  assert.equal(stored().updated_at,now);
  for (const value of ['', 'unknown', false, 1, {}, []]) assert.throws(() => saveAnnouncement(db,{...item,service_stage:value},now), /Tahap layanan/);
  assert.throws(() => saveAnnouncement(db,{...omitted,category:'PRICING'},now), /PRICING/);
  assert.equal(stored().stage,'investigating');
  const second = saveAnnouncement(db,{...base,slug:'second',service_stage:null},now);
  assert.throws(() => saveAnnouncement(db,{...item,slug:second.slug,service_stage:'resolved'},now+3));
  assert.equal(stored().stage,'investigating');
  for (const [index,stage] of ['fixing','monitoring','resolved'].entries()) {
    item = saveAnnouncement(db,{...item,service_stage:stage},now+index+4);
    assert.equal(stored().stage,stage);
    assert.equal(stored().updated_at,now+index+4);
  }
  const source = readFileSync(new URL('./lib/customer-dashboard.mjs',import.meta.url),'utf8');
  const context = vm.createContext({ownedIds:async customer => JSON.stringify(customer.id==='owner' ? ['owned'] : []),routerDb:()=>db,performance:{now:()=>1},AbortSignal,Date,fetch:async url=>({ok:true,status:200,body:url.includes('3082')?'OK':'{"ok":true}'}),boundedText:async response=>response.body});
  vm.runInContext(source.slice(source.indexOf('export async function customerStatus(')).replace('export ',''),context);
  const notices = async (customer='owner') => JSON.parse(JSON.stringify((await context.customerStatus({id:customer})).notices));
  assert.deepEqual((await notices()).map(notice=>notice.id),[item.id]);
  assert.deepEqual((await notices())[0].progress,{stage:'resolved',updatedAt:new Date(now+6).toISOString()});
  assert.equal((await notices('no-keys')).length,1);
  db.prepare("UPDATE axiom_notices SET target='group',target_group='key:owned' WHERE notice_id=?").run(item.id);
  assert.equal((await notices()).length,1);
  assert.equal((await notices('no-keys')).length,0);
  for (const patch of [{status:'draft'},{published_at:new Date(now+86400000).toISOString()},{expires_at:new Date(now-1).toISOString()}]) {
    saveAnnouncement(db,{...item,...patch},now);
    assert.equal((await notices()).length,0);
  }
  saveAnnouncement(db,item,now);
  db.prepare("UPDATE axiom_announcement_details SET audience='invalid' WHERE id=?").run(item.id);
  assert.equal((await notices()).length,0);
  saveAnnouncement(db,item,now);
  db.prepare("UPDATE axiom_announcement_details SET category='PRICING' WHERE id=?").run(item.id);
  assert.equal((await notices()).length,0);
  saveAnnouncement(db,item,now);
  item = saveAnnouncement(db,{...item,service_stage:null},now+7);
  assert.equal(item.service_stage,null);
  assert.equal(stored(),undefined);
  assert.equal((await notices()).length,0);
  saveAnnouncement(db,{...item,category:'PRICING'},now+8);
  db.prepare("INSERT INTO axiom_notices VALUES('legacy',1,'always','all',NULL,'UPDATE',0,NULL,NULL,'Legacy','Legacy notice')").run();
  assert.deepEqual((await notices()).map(notice=>[notice.id,notice.progress]),[['legacy',null]]);
} finally { db.close(); }
console.log('PASS service workflow persistence, validation, atomicity, visibility, targeting, and legacy compatibility');
