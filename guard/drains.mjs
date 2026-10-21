import dns from 'node:dns/promises';
import https from 'node:https';
import {BlockList,isIP} from 'node:net';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';

const KINDS=['detection','connection','disconnection','system'];
const LIMITS={drains:20,queuePerDrain:100,historyPerDrain:100,dedupPerDrain:10000,payloadBytes:32768};
const blocked=new BlockList(),globalV6=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.31.196.0',24],['192.52.193.0',24],['192.88.99.0',24],['192.168.0.0',16],['192.175.48.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(ip,bits,'ipv4');
globalV6.addSubnet('2000::',3,'ipv6');
blocked.addAddress('168.63.129.16','ipv4');
blocked.addSubnet('3ffe::',16,'ipv6');
blocked.addSubnet('2620:4f:8000::',48,'ipv6');
for(const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])blocked.addSubnet(ip,bits,'ipv6');
function publicAddress(address){const family=isIP(address);return family===4?!blocked.check(address,'ipv4'):family===6&&globalV6.check(address,'ipv6')&&!blocked.check(address,'ipv6');}
function destination(value){
  if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f\\]/.test(value))throw Error('Invalid destination.');
  const url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||url.username||url.password||value.includes('@')||value.includes('#')||(url.port&&url.port!=='443'))throw Error('Use HTTPS port 443 without credentials or fragment.');
  if(!host||host.endsWith('.')||(!isIP(host)&&(!host.includes('.')||/(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|example|onion)$/.test(host))))throw Error('Public destination required.');
  if(isIP(host)&&!publicAddress(host))throw Error('Public destination required.');
  return url;
}
async function resolvePublic(url){
  const host=url.hostname.replace(/^\[|\]$/g,''),family=isIP(host);
  let timer;
  const records=family?[{address:host,family}]:await Promise.race([dns.lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS timeout.')),3000);})]).finally(()=>clearTimeout(timer));
  if(!Array.isArray(records)||!records.length||records.some(r=>!publicAddress(r.address)||isIP(r.address)!==r.family))throw Error('Destination DNS is not public.');
  return records[0];
}
async function deliver(endpoint,body,secret,timestamp){
  const url=destination(endpoint),pinned=await resolvePublic(url),host=url.hostname.replace(/^\[|\]$/g,'');
  const signature=createHmac('sha256',Buffer.from(secret,'hex')).update(`${timestamp}.`).update(body).digest('hex');
  return new Promise((resolve,reject)=>{
    let req,timer,settled=false;
    const finish=(error,status)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(status);};
    try{
      req=https.request({protocol:'https:',hostname:host,port:443,path:url.pathname+url.search,method:'POST',agent:false,rejectUnauthorized:true,servername:isIP(host)?undefined:host,family:pinned.family,
        lookup:(_host,options,callback)=>callback(null,options?.all?[pinned]:pinned.address,pinned.family),
        headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),'x-guard-timestamp':timestamp,'x-guard-signature':`sha256=${signature}`}},res=>{
          const status=res.statusCode;res.on('error',()=>{});res.destroy();finish(null,status);
        });
      req.on('error',()=>finish(Error('Delivery failed.')));
      timer=setTimeout(()=>{finish(Error('Delivery timed out.'));req.destroy();},5000);
      req.end(body);
    }catch{finish(Error('Delivery failed.'));req?.destroy();}
  });
}

export function createDrains({db,fail,text,audit,now}){
  db.exec(`CREATE TABLE IF NOT EXISTS ed_drains(id TEXT PRIMARY KEY,name TEXT NOT NULL,endpoint TEXT NOT NULL,kinds TEXT NOT NULL,enabled INTEGER NOT NULL,secret TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ed_queue(id INTEGER PRIMARY KEY,drain_id TEXT NOT NULL,event_key TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(drain_id,event_key));
    CREATE TABLE IF NOT EXISTS ed_seen(id INTEGER PRIMARY KEY,drain_id TEXT NOT NULL,event_key TEXT NOT NULL,UNIQUE(drain_id,event_key));
    CREATE TABLE IF NOT EXISTS ed_history(id INTEGER PRIMARY KEY,drain_id TEXT NOT NULL,event_key TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,http_status INTEGER,at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ed_history_drain ON ed_history(drain_id,id);`);
  const busy=new Set(),iso=()=>new Date(now()).toISOString(),get=id=>db.prepare('SELECT * FROM ed_drains WHERE id=?').get(id);
  const prune=(table,id,limit)=>db.prepare(`DELETE FROM ${table} WHERE drain_id=? AND id NOT IN(SELECT id FROM ${table} WHERE drain_id=? ORDER BY id DESC LIMIT ?)`).run(id,id,limit);
  function history(id,event,status,httpStatus=null){
    if(!get(id))return;
    db.prepare('INSERT INTO ed_history(drain_id,event_key,kind,status,http_status,at) VALUES(?,?,?,?,?,?)').run(id,event.event_key,event.kind,status,httpStatus,iso());
    prune('ed_history',id,LIMITS.historyPerDrain);
  }
  function ingest(_server,events){
    const drains=db.prepare('SELECT * FROM ed_drains WHERE enabled=1').all();
    for(const event of events){
      if(!event||typeof event.key!=='string'||!event.key||event.key.length>200||!KINDS.includes(event.kind))continue;
      let body;
      try{body=JSON.stringify({version:1,event});}catch{body=null;}
      for(const drain of drains){
        if(!JSON.parse(drain.kinds).includes(event.kind))continue;
        const seen=db.prepare('INSERT OR IGNORE INTO ed_seen(drain_id,event_key) VALUES(?,?)').run(drain.id,event.key);
        if(!seen.changes)continue;
        prune('ed_seen',drain.id,LIMITS.dedupPerDrain);
        const item={event_key:event.key,kind:event.kind};
        if(!body||Buffer.byteLength(body)>LIMITS.payloadBytes){history(drain.id,item,'payload-too-large');continue;}
        const count=db.prepare('SELECT count(*) n FROM ed_queue WHERE drain_id=?').get(drain.id).n;
        if(count>=LIMITS.queuePerDrain){history(drain.id,item,'queue-full');continue;}
        db.prepare('INSERT OR IGNORE INTO ed_queue(drain_id,event_key,kind,body) VALUES(?,?,?,?)').run(drain.id,event.key,event.kind,body);
      }
    }
  }
  async function send(drain,item){
    let status='failed',httpStatus=null;
    try{httpStatus=await deliver(drain.endpoint,item.body,drain.secret,String(Math.floor(new Date(now()).getTime()/1000)));status=httpStatus>=200&&httpStatus<300?'delivered':httpStatus>=300&&httpStatus<400?'redirect-blocked':'http-error';}catch{}
    history(drain.id,item,status,httpStatus);
    return {eventKey:item.event_key,kind:item.kind,status,httpStatus};
  }
  async function flush(){
    const pending=db.prepare('SELECT * FROM ed_drains WHERE enabled=1').all();
    await Promise.all(pending.map(async drain=>{
      if(busy.has(drain.id))return;
      const item=db.prepare('SELECT * FROM ed_queue WHERE drain_id=? ORDER BY id LIMIT 1').get(drain.id);
      if(!item)return;
      busy.add(drain.id);
      try{
        db.prepare('DELETE FROM ed_queue WHERE id=?').run(item.id);
        await send(drain,item);
      }finally{busy.delete(drain.id);}
    }));
  }
  function view(drain){
    const history=db.prepare('SELECT event_key AS eventKey,kind,status,http_status AS httpStatus,at FROM ed_history WHERE drain_id=? ORDER BY id DESC LIMIT ?').all(drain.id,LIMITS.historyPerDrain);
    return {id:drain.id,name:drain.name,endpoint:drain.endpoint,kinds:JSON.parse(drain.kinds),enabled:!!drain.enabled,signingKey:'Configured (hidden)',createdAt:drain.created_at,updatedAt:drain.updated_at,queued:db.prepare('SELECT count(*) n FROM ed_queue WHERE drain_id=?').get(drain.id).n,delivering:busy.has(drain.id),history};
  }
  function fields(body,allowed){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'Invalid drain fields.');
  }
  async function config(body,old){
    const name=text(Object.hasOwn(body,'name')?body.name:old?.name,80,'Drain name').trim();
    const endpoint=text(Object.hasOwn(body,'endpoint')?body.endpoint:old?.endpoint,2048,'Destination');
    const kinds=Object.hasOwn(body,'kinds')?body.kinds:old?JSON.parse(old.kinds):undefined;
    const enabled=Object.hasOwn(body,'enabled')?body.enabled:old?!!old.enabled:undefined;
    if(!name||!Array.isArray(kinds)||!kinds.length||kinds.length>KINDS.length||kinds.some(k=>!KINDS.includes(k))||new Set(kinds).size!==kinds.length||typeof enabled!=='boolean')fail(400,'Choose a name, event kinds and enabled state.');
    let url;
    try{url=destination(endpoint);if(!old||old.endpoint!==url.href)await resolvePublic(url);}catch{fail(400,'Destination must resolve only to public HTTPS addresses on port 443.');}
    return {name,endpoint:url.href,kinds:JSON.stringify(kinds),enabled:Number(enabled)};
  }
  const confirmed=body=>{if(body.confirm!==true)fail(400,'Explicit confirmation required.');};
  const idle=id=>{if(busy.has(id))fail(409,'Delivery in progress; try again after it completes.');};
  async function routes(path,method,body,url,user){
    if(!/^\/api\/event-drains(?:\/|$)/.test(path))return undefined;
    if(!user?.id)fail(401,'Sign in required.');
    if(method!=='GET'&&!['owner','admin'].includes(user.role))fail(403,'Administrator access required.');
    if(path==='/api/event-drains'&&method==='GET')return {drains:db.prepare('SELECT * FROM ed_drains ORDER BY created_at,id').all().map(view),limits:LIMITS};
    if(method!=='POST')fail(405,'Method not allowed.');
    if(path==='/api/event-drains'){
      fields(body,['name','endpoint','kinds','enabled','confirm']);confirmed(body);
      const value=await config(body);
      if(db.prepare('SELECT count(*) n FROM ed_drains').get().n>=LIMITS.drains)fail(400,'Maximum 20 event drains.');
      const id=randomUUID(),secret=randomBytes(32).toString('hex'),at=iso();
      db.prepare('INSERT INTO ed_drains(id,name,endpoint,kinds,enabled,secret,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,value.name,value.endpoint,value.kinds,value.enabled,secret,at,at);
      audit('event-drain.create',{id,actor:user.id});
      return {drain:view(get(id)),secret};
    }
    const match=/^\/api\/event-drains\/([a-f0-9-]{36})(?:\/(remove|test))?$/.exec(path);
    if(!match)fail(404,'Drain route not found.');
    const [,id,action]=match,old=get(id);
    if(!old)fail(404,'Drain not found.');
    idle(id);
    if(action==='remove'){
      fields(body,['confirm']);confirmed(body);
      for(const table of ['ed_queue','ed_seen','ed_history'])db.prepare(`DELETE FROM ${table} WHERE drain_id=?`).run(id);
      db.prepare('DELETE FROM ed_drains WHERE id=?').run(id);
      audit('event-drain.remove',{id,actor:user.id});return {ok:true};
    }
    if(action==='test'){
      fields(body,['confirm']);confirmed(body);busy.add(id);
      const event={key:'test-'+randomUUID(),at:iso(),kind:'system',details:{test:true}};
      audit('event-drain.test',{id,actor:user.id});
      try{return {delivery:await send(old,{event_key:event.key,kind:event.kind,body:JSON.stringify({version:1,event})})};}finally{busy.delete(id);}
    }
    fields(body,['name','endpoint','kinds','enabled','rotate','confirm']);confirmed(body);
    if(body.rotate!==undefined&&typeof body.rotate!=='boolean')fail(400,'Invalid rotation flag.');
    const value=await config(body,old);
    idle(id);
    if(get(id)?.revision!==old.revision)fail(409,'Drain changed; refresh before saving.');
    const secret=body.rotate?randomBytes(32).toString('hex'):old.secret;
    db.prepare('UPDATE ed_drains SET name=?,endpoint=?,kinds=?,enabled=?,secret=?,revision=revision+1,updated_at=? WHERE id=?').run(value.name,value.endpoint,value.kinds,value.enabled,secret,iso(),id);
    const queued=db.prepare('SELECT * FROM ed_queue WHERE drain_id=?').all(id);
    for(const item of queued)history(id,item,'cancelled-config-change');
    db.prepare('DELETE FROM ed_queue WHERE drain_id=?').run(id);
    audit(body.rotate?'event-drain.rotate':'event-drain.update',{id,actor:user.id});
    return {drain:view(get(id)),...(body.rotate?{secret}:{})};
  }
  return {routes,ingest,flush};
}
