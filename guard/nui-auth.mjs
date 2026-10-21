import {createHash, randomBytes} from 'node:crypto';

const identityFields=['playerId','playerName','playerSession','serverSession','license'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
const credential=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const ticketKey=ticket=>createHash('sha256').update(ticket).digest('hex');
const sameIdentity=(a,b)=>identityFields.every(key=>a[key]===b[key]);
const validIdentity=value=>object(value)&&Object.keys(value).length===identityFields.length
  &&identityFields.every(key=>Object.hasOwn(value,key))&&Number.isSafeInteger(value.playerId)&&value.playerId>0
  &&text(value.playerName,128)&&text(value.playerSession,160)&&text(value.serverSession,160)
  &&text(value.license,160)&&/^license2?:[a-f0-9]+$/.test(value.license);

export function createNuiAuth({sessions,getLive,fail,audit,now,adminUser}) {
  const tickets=new Map();
  const clock=()=>{const value=now();return typeof value==='number'?value:Date.parse(value);};
  function identity(body) {
    if(!validIdentity(body))fail(400,'Invalid native dashboard identity.');
    return Object.fromEntries(identityFields.map(key=>[key,body[key]]));
  }
  function playerFor(value,live) {
    if(!validIdentity(value)||live?.online!==true||live.sessionId!==value.serverSession||!Array.isArray(live.players))return null;
    const player=live.players.find(player=>player.id===value.playerId);
    if(!player||player.dashboardAdmin!==true||player.name!==value.playerName||player.sessionId!==value.playerSession||!Array.isArray(player.identifiers))return null;
    const primary=player.identifiers.find(id=>typeof id==='string'&&id.startsWith('license:'))
      ??player.identifiers.find(id=>typeof id==='string'&&id.startsWith('license2:'));
    return primary===value.license?player:null;
  }
  function userFor(player,value) {
    const user=adminUser({...player,...value});
    return user?.role==='admin'&&user.groupId==='admin'?user:null;
  }
  function invalidate(record) {
    record.expires=0;
    for(const [token,value] of sessions)if(value===record)sessions.delete(token);
  }
  function validRecord(record,live,time) {
    if(record?.native!==true||record.transport!=='nui'||!Number.isFinite(record.expires)||record.expires<=time||!Number.isFinite(time))return false;
    const player=playerFor(record.nativeIdentity,live);
    if(!player)return false;
    const user=userFor(player,record.nativeIdentity);
    if(!user)return false;
    record.user=user;
    return true;
  }
  function validate(record) {
    if(validRecord(record,getLive(),clock()))return record.user;
    if(record?.native===true)invalidate(record);
    return null;
  }
  function sweep() {
    const live=getLive(),time=clock();
    for(const [key,record] of tickets)if(!Number.isFinite(time)||record.expires<=time||!playerFor(record.native,live))tickets.delete(key);
    for(const [token,record] of sessions) {
      if(record.native===true&&!validRecord(record,live,time)) {record.expires=0;sessions.delete(token);}
      else if(record.expires<=time)sessions.delete(token);
    }
  }
  function issue(body) {
    const value=identity(body);
    sweep();
    const player=playerFor(value,getLive()),time=clock();
    if(!player||!Number.isFinite(time))fail(403,'Native administrator verification failed.');
    if(!userFor(player,value))fail(403,'Native administrator account is unavailable.');
    if(tickets.size>=100)fail(429,'Too many pending native dashboard tickets.');
    const ticket=randomBytes(32).toString('base64url');
    tickets.set(ticketKey(ticket),{native:value,expires:time+30000});
    audit('nui.ticket',{playerId:value.playerId});
    return {ticket,expires:time+30000};
  }
  function redeem(body) {
    if(!object(body)||Object.keys(body).length!==1||!Object.hasOwn(body,'ticket')||!credential(body.ticket))fail(400,'Invalid native dashboard ticket.');
    const key=ticketKey(body.ticket),record=tickets.get(key);
    tickets.delete(key);
    const time=clock(),player=record&&playerFor(record.native,getLive());
    if(!record||!Number.isFinite(time)||record.expires<=time||!player)fail(401,'Native dashboard ticket expired or invalid.');
    const user=userFor(player,record.native);
    if(!user)fail(403,'Native administrator account is unavailable.');
    sweep();
    if(sessions.size>=100)fail(429,'Too many active dashboard sessions.');
    const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');
    sessions.set(token,{transport:'nui',native:true,nativeIdentity:record.native,user,csrf,expires:time+28800000});
    audit('nui.login',{playerId:record.native.playerId});
    return {authenticated:true,token,csrf,user};
  }
  function revoke(body) {
    const value=identity(body);
    for(const [key,record] of tickets)if(sameIdentity(record.native,value))tickets.delete(key);
    for(const [token,record] of sessions)if(record.native===true&&record.nativeIdentity&&sameIdentity(record.nativeIdentity,value)) {
      record.expires=0;sessions.delete(token);
    }
    audit('nui.revoke',{playerId:value.playerId});
    return {ok:true};
  }
  return {issue,redeem,validate,revoke,sweep};
}
