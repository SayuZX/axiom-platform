import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createResourceControl} from './resource-control.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const folder=mkdtempSync(join(tmpdir(),'guard-control-'));
process.env.GUARD_TXADMIN_TRANSPORT=join(folder,'transport.json');
const db=new DatabaseSync(':memory:');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const audit=[];
const controls=createResourceControl({db,fail,audit:(action,details)=>audit.push({action,details}),now:()=>new Date().toISOString()});
const route=(method,body,user,path='/api/resources/commands')=>controls.routes(path,method,body,new URL(path,'http://local'),user);
for(const user of [null,{id:2,name:'Viewer',groupId:'viewer',role:'viewer'},{id:3,name:'Custom config',groupId:'group_config',role:'admin',permissions:['read','config']}, {id:4,name:'Forged',role:'owner'}]){
 await assert.rejects(route('GET',undefined,user),e=>e.status===403);
}
const owner={id:1,name:'Owner',groupId:'owner',role:'owner'};
assert.deepEqual((await route('GET',undefined,owner)).commands,[]);
assert.deepEqual((await route('GET',undefined,{...owner,groupId:'admin'})).commands,[]);
for(const target of ['axiom_guard;quit','../qb-core','qb-core\nquit','[qb]','']){
 await assert.rejects(route('POST',{action:'restart',target,serverSession:'s',confirmed:true},owner),e=>e.status===400);
}
await assert.rejects(route('POST',{action:'restart',target:'axiom_guard',serverSession:'s',confirmed:false},owner),e=>e.status===400);
await assert.rejects(route('POST',{action:'restart',target:'axiom_guard',serverSession:'s',confirmed:true,command:'quit'},owner),e=>e.status===400);
await assert.rejects(route('POST',{action:'restart',target:'axiom_guard',serverSession:'s',confirmed:true},owner),e=>e.status===503);
writeFileSync(process.env.GUARD_TXADMIN_TRANSPORT,JSON.stringify({token:'short',port:40120}));
await assert.rejects(route('POST',{action:'start',target:'axiom_guard',serverSession:'s',confirmed:true},owner),e=>e.status===503);
rmSync(folder,{recursive:true,force:true});
assert.equal(audit.filter(row=>row.action==='resource.denied').length,4);
db.close();console.log('PASS: built-in administrator isolation, exact resource/action validation, explicit confirmation and missing native transport errors');
