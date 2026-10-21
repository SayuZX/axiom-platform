import assert from 'node:assert/strict';
import {createNuiAuth} from './nui-auth.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const denied=(fn,status)=>assert.throws(fn,error=>error.status===status);
function fixture() {
  let time=1800000000000;
  const identity={playerId:7,playerName:'Native Admin',playerSession:'server-a:1',serverSession:'server-a',license:'license:abcdef'};
  const live={online:true,sessionId:identity.serverSession,players:[{id:identity.playerId,name:identity.playerName,sessionId:identity.playerSession,identifiers:['license2:123abc',identity.license],dashboardAdmin:true}]};
  const sessions=new Map(),audit=[];
  const context={sessions,getLive:()=>live,fail,audit:(action,details)=>audit.push({action,details}),now:()=>new Date(time).toISOString(),
    adminUser:player=>({id:`native:${player.id}`,name:player.name,role:'admin',groupId:'admin',permissions:['read','config','players','bans','resources']})};
  const auth=createNuiAuth(context);
  const login=()=>auth.redeem({ticket:auth.issue(identity).ticket});
  return {identity,live,sessions,audit,context,auth,login,advance:ms=>{time+=ms;}};
}

// Exact boundary schema: no coercion, missing fields or ignored extensions.
{
  const f=fixture();
  for(const bad of [null,[],{}, {...f.identity,extra:true}])denied(()=>f.auth.issue(bad),400);
  const invalid={playerId:[0,-1,1.5,'7',Number.MAX_SAFE_INTEGER+1],playerName:['',null,'x'.repeat(129),'a\nb'],
    playerSession:['',null,'x'.repeat(161),'a\0b'],serverSession:['',null,'x'.repeat(161)],
    license:['','steam:abcdef','license:','license:ABCDEF','license:xyz','license:abc\n','license:'+ 'a'.repeat(153)]};
  for(const [key,values] of Object.entries(invalid)) {
    const missing={...f.identity};delete missing[key];
    denied(()=>f.auth.issue(missing),400);
    for(const value of values)denied(()=>f.auth.issue({...f.identity,[key]:value}),400);
  }
  for(const body of [null,[],{}, {ticket:'short'},{ticket:'a'.repeat(44)},{ticket:'a'.repeat(43),extra:true}])denied(()=>f.auth.redeem(body),400);
  denied(()=>f.auth.redeem({ticket:'a'.repeat(43)}),401);
}

// Exact live identity, strict permission, primary license precedence.
for(const change of [
  f=>{f.live.online=false;},f=>{f.live.players=[];},f=>{f.live.sessionId='server-b';},
  f=>{f.live.players[0].id=8;},f=>{f.live.players[0].name='Renamed';},
  f=>{f.live.players[0].sessionId='server-a:2';},f=>{f.live.players[0].dashboardAdmin=false;},
  f=>{f.live.players[0].dashboardAdmin='true';},f=>{delete f.live.players[0].dashboardAdmin;},
  f=>{f.live.players[0].identifiers=['license:123abc',f.identity.license];},
  f=>{f.live.players[0].identifiers=['license2:abcdef'];}
]) {
  const f=fixture();change(f);denied(()=>f.auth.issue(f.identity),403);
}
{
  const f=fixture();
  denied(()=>f.auth.issue({...f.identity,license:'license2:123abc'}),403);
  f.live.players[0].identifiers=['license2:123abc'];f.identity.license='license2:123abc';
  assert.equal(f.login().user.role,'admin');
}

// Single use; failed redemption also consumes the ticket permanently.
{
  const f=fixture(),issued=f.auth.issue(f.identity);
  assert.match(issued.ticket,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.expires,1800000030000);
  f.advance(29999);
  const result=f.auth.redeem({ticket:issued.ticket});
  assert.equal(result.authenticated,true);
  assert.match(result.token,/^[A-Za-z0-9_-]{43}$/);
  assert.match(result.csrf,/^[A-Za-z0-9_-]{32}$/);
  assert.equal(result.user.role,'admin');assert.equal(result.user.groupId,'admin');
  assert.deepEqual(f.auth.validate(f.sessions.get(result.token)),result.user);
  denied(()=>f.auth.redeem({ticket:issued.ticket}),401);
  const log=JSON.stringify(f.audit);
  for(const secret of [issued.ticket,result.token,result.csrf,f.identity.license,f.identity.playerSession])assert.equal(log.includes(secret),false);
}
{
  const f=fixture(),issued=f.auth.issue(f.identity);f.advance(30000);
  denied(()=>f.auth.redeem({ticket:issued.ticket}),401);
}
{
  const f=fixture(),issued=f.auth.issue(f.identity);f.live.online=false;
  denied(()=>f.auth.redeem({ticket:issued.ticket}),401);f.live.online=true;
  denied(()=>f.auth.redeem({ticket:issued.ticket}),401);
}

// Every request rechecks native state; an invalidated session cannot revive.
for(const change of [
  f=>{f.live.online=false;},f=>{f.live.players=[];},f=>{f.live.sessionId='server-b';},
  f=>{f.live.players[0].sessionId='server-a:2';},f=>{f.live.players[0].name='Renamed';},
  f=>{f.live.players[0].identifiers=['license:123abc'];},f=>{f.live.players[0].dashboardAdmin=false;}
]) {
  const f=fixture(),result=f.login(),record=f.sessions.get(result.token),before=structuredClone(f.live);
  change(f);
  assert.equal(f.auth.validate(record),null);assert.equal(f.sessions.has(result.token),false);
  Object.assign(f.live,before);assert.equal(f.auth.validate(record),null);
}
{
  const f=fixture(),result=f.login(),record=f.sessions.get(result.token);
  f.advance(28800000-1);assert.equal(f.auth.validate(record).role,'admin');
  f.advance(1);assert.equal(f.auth.validate(record),null);assert.equal(f.sessions.has(result.token),false);
}
{
  const f=fixture(),issued=f.auth.issue(f.identity),result=f.login();
  const web={transport:'web',user:{role:'owner'},expires:1800028800000};f.sessions.set('web',web);
  f.live.online=false;f.auth.sweep();f.live.online=true;
  denied(()=>f.auth.redeem({ticket:issued.ticket}),401);
  assert.equal(f.sessions.has(result.token),false);assert.equal(f.sessions.get('web'),web);
}

// Revoke only the exact connection identity, even after disconnect.
{
  const f=fixture(),issued=f.auth.issue(f.identity),result=f.login();
  denied(()=>f.auth.revoke({...f.identity,ticket:issued.ticket}),400);
  for(const [key,value] of Object.entries({playerId:8,playerName:'Other',playerSession:'server-a:2',serverSession:'server-b',license:'license:123abc'})) {
    f.auth.revoke({...f.identity,[key]:value});assert.equal(f.auth.validate(f.sessions.get(result.token)).role,'admin');
  }
  f.live.players=[];assert.deepEqual(f.auth.revoke(f.identity),{ok:true});
  assert.equal(f.sessions.has(result.token),false);denied(()=>f.auth.redeem({ticket:issued.ticket}),401);
  f.auth.revoke(f.identity);
}
{
  const f=fixture(),old={...f.identity};f.login();
  f.identity.playerSession='server-a:2';f.live.players[0].sessionId=f.identity.playerSession;
  const current=f.login();f.auth.revoke(old);
  assert.equal(f.auth.validate(f.sessions.get(current.token)).role,'admin');
}

// Provider misconfiguration never grants Owner or a custom group.
for(const user of [null,{role:'owner',groupId:'owner'},{role:'owner',groupId:'admin'},{role:'admin',groupId:'owner'},{role:'admin',groupId:'custom'}]) {
  const f=fixture(),auth=createNuiAuth({...f.context,adminUser:()=>user});
  denied(()=>auth.issue(f.identity),403);
}
{
  const f=fixture();let owner=false;
  const auth=createNuiAuth({...f.context,adminUser:p=>owner?{role:'owner',groupId:'owner'}:f.context.adminUser(p)});
  const first=auth.redeem({ticket:auth.issue(f.identity).ticket}),issued=auth.issue(f.identity);
  owner=true;denied(()=>auth.redeem({ticket:issued.ticket}),403);
  assert.equal(auth.validate(f.sessions.get(first.token)),null);
  owner=false;denied(()=>auth.redeem({ticket:issued.ticket}),401);
}

// Caps reject excess work without evicting active tickets/sessions.
{
  const f=fixture(),tickets=Array.from({length:100},()=>f.auth.issue(f.identity).ticket);
  denied(()=>f.auth.issue(f.identity),429);
  assert.equal(f.auth.redeem({ticket:tickets[0]}).authenticated,true);
  f.auth.issue(f.identity);
  f.advance(30000);f.auth.sweep();
  denied(()=>f.auth.redeem({ticket:tickets[1]}),401);
  assert.equal(f.auth.redeem({ticket:f.auth.issue(f.identity).ticket}).authenticated,true);
}
{
  const f=fixture(),first=f.login();
  for(let i=1;i<100;i++)f.login();
  const issued=f.auth.issue(f.identity);denied(()=>f.auth.redeem({ticket:issued.ticket}),429);
  assert.equal(f.auth.validate(f.sessions.get(first.token)).role,'admin');
  f.sessions.delete(first.token);denied(()=>f.auth.redeem({ticket:issued.ticket}),401);
  assert.equal(f.login().authenticated,true);
}
console.log('PASS: native identity, primary license, single-use tickets, expiry, live revocation, exact revoke, Owner isolation and capacity');
