import {createHmac, randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const scryptAsync=promisify(scrypt);
const validPassword=value=>typeof value==='string'&&value.length>=8&&value.length<=128&&!value.includes('\0');

export async function createAutomation({db, fail, text, audit, now, passwordKey, ownerPassword, invalidateSessions=()=>{}, onOwnerPasswordReset=()=>{}}) {
  if(typeof passwordKey!=='string'||passwordKey.length<32||passwordKey.includes('\0'))throw new Error('A private passwordKey is required.');
  const permissionKeys=['read','config','players','bans','automation','users'];
  const defaults={owner:permissionKeys,admin:permissionKeys.filter(p=>p!=='users'),viewer:['read']};
  const digest=password=>createHmac('sha256',passwordKey).update(password).digest('hex');
  let deriving=0;
  const waiting=[];
  async function derive(password,salt) {
    if(deriving>=2) {
      if(waiting.length>=32)fail(503,'Password service is busy. Try again shortly.');
      await new Promise(resolve=>waiting.push(resolve));
    } else deriving++;
    try {return await scryptAsync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
    finally {const next=waiting.shift();if(next)next();else deriving--;}
  }
  async function passwordFields(password) {
    if(!validPassword(password))fail(400,'Password must be 8–128 characters without NUL.');
    const lookup=digest(password),salt=randomBytes(32).toString('hex');
    const hash=(await derive(password,salt)).toString('hex');
    return {lookup,salt,hash};
  }
  function uniquePassword(lookup,id=null) {
    const existing=db.prepare('SELECT id FROM au_users WHERE password_lookup=?').get(lookup);
    if(existing&&existing.id!==id)fail(409,'Password is already in use.');
  }
  db.exec('SAVEPOINT au_password_migration');
  try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS au_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS au_users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,group_id TEXT,password_lookup TEXT,password_salt TEXT,password_hash TEXT,created TEXT NOT NULL,revoked TEXT);
    CREATE TABLE IF NOT EXISTS au_groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,permissions TEXT NOT NULL,builtin INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS au_webhooks(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,url TEXT NOT NULL,enabled INTEGER NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS au_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,config TEXT NOT NULL,enabled INTEGER NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS au_seen(key TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS au_executions(id INTEGER PRIMARY KEY,trigger_id INTEGER,trigger_name TEXT NOT NULL,event_key TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL,finished TEXT,UNIQUE(trigger_id,event_key));
    CREATE TABLE IF NOT EXISTS au_outbox(id INTEGER PRIMARY KEY,execution_id INTEGER UNIQUE NOT NULL,webhook_id INTEGER NOT NULL,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS au_execution_at ON au_executions(at);
  `);
  const hookColumns=new Set(db.prepare('PRAGMA table_info(au_webhooks)').all().map(c=>c.name));
  if(!hookColumns.has('event_kinds'))db.exec("ALTER TABLE au_webhooks ADD COLUMN event_kinds TEXT NOT NULL DEFAULT '[]'");
  const outboxColumns=new Set(db.prepare('PRAGMA table_info(au_outbox)').all().map(c=>c.name));
  if(!outboxColumns.has('attempts'))db.exec('ALTER TABLE au_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
  if(!outboxColumns.has('next_attempt'))db.exec('ALTER TABLE au_outbox ADD COLUMN next_attempt INTEGER NOT NULL DEFAULT 0');
  if(!db.prepare('PRAGMA table_info(au_executions)').all().some(c=>c.name==='delivery_key'))db.exec('ALTER TABLE au_executions ADD COLUMN delivery_key TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS au_delivery_key ON au_executions(delivery_key) WHERE delivery_key IS NOT NULL');
  for(const [id,permissions] of Object.entries(defaults))db.prepare('INSERT OR IGNORE INTO au_groups(id,name,permissions,builtin) VALUES(?,?,?,1)').run(id,id[0].toUpperCase()+id.slice(1),JSON.stringify(permissions));
  const columns=new Set(db.prepare('PRAGMA table_info(au_users)').all().map(c=>c.name));
  if(!columns.has('group_id'))db.exec('ALTER TABLE au_users ADD COLUMN group_id TEXT');
  db.exec('UPDATE au_users SET group_id=role WHERE group_id IS NULL');
  if(!db.prepare("SELECT value FROM au_meta WHERE key='password-auth-version'").get()) {
    for(const column of ['password_lookup','password_salt','password_hash'])if(!columns.has(column))db.exec(`ALTER TABLE au_users ADD COLUMN ${column} TEXT`);
    db.exec('UPDATE au_users SET password_lookup=NULL,password_salt=NULL,password_hash=NULL');
    if(columns.has('hash'))db.exec('ALTER TABLE au_users DROP COLUMN hash');
    db.prepare("INSERT INTO au_meta(key,value) VALUES('password-auth-version','1')").run();
  }
  db.exec("DELETE FROM au_meta WHERE key='token-key'; CREATE UNIQUE INDEX IF NOT EXISTS au_password_lookup ON au_users(password_lookup) WHERE password_lookup IS NOT NULL");
  const owner=db.prepare("SELECT * FROM au_users WHERE group_id='owner' ORDER BY id LIMIT 1").get();
  if(!owner?.password_hash) {
    const initial=typeof ownerPassword==='function'?await ownerPassword():ownerPassword;
    const fields=await passwordFields(initial);
    uniquePassword(fields.lookup,owner?.id);
    if(owner)db.prepare("UPDATE au_users SET role='owner',revoked=NULL,password_lookup=?,password_salt=?,password_hash=? WHERE id=?").run(fields.lookup,fields.salt,fields.hash,owner.id);
    else db.prepare("INSERT INTO au_users(name,role,group_id,password_lookup,password_salt,password_hash,created) VALUES('Owner','owner','owner',?,?,?,?)").run(fields.lookup,fields.salt,fields.hash,now());
  } else if(owner.revoked)throw new Error('Owner account must not be revoked.');
  const ownerId=db.prepare("SELECT id FROM au_users WHERE group_id='owner' ORDER BY id LIMIT 1").get().id;
  if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lg_bookmarks'").get())db.prepare("UPDATE lg_bookmarks SET user_id=? WHERE user_id='owner'").run(ownerId);
  db.exec('RELEASE au_password_migration');
  } catch(error) {db.exec('ROLLBACK TO au_password_migration; RELEASE au_password_migration');throw error;}
  const dummy=await passwordFields(randomBytes(32).toString('base64url'));
  db.prepare("UPDATE au_executions SET status='queued',detail='Delivery interrupted; retry pending. Discord may have accepted the previous attempt.' WHERE status='sending' AND id IN (SELECT execution_id FROM au_outbox)").run();
  db.prepare("UPDATE au_executions SET status='failed',detail='Legacy delivery interrupted without a retained payload; outcome unknown.',finished=? WHERE status='sending'").run(now());
  const roles=['owner','admin','viewer'];
  const kinds=['detection','connection','disconnection'];
  const loggingKinds=[...kinds,'system'];
  const maxAttempts=5;
  const severities=['info','low','medium','high'];
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const required=(v,max,label)=>{const s=text(v,max,label).trim();if(!s)fail(400,`${label} is required.`);return s;};
  function authorize(user,owner=false,write=false) {
    if(!user||!roles.includes(user.role))fail(401,'Sign in required.');
    if(owner&&user.role!=='owner'||write&&user.role==='viewer')fail(403,'Insufficient permissions.');
  }
  function groupConfig(body) {
    const name=required(body.name,80,'Group name');
    if(!Array.isArray(body.permissions)||body.permissions.some(p=>!permissionKeys.includes(p)))fail(400,'Invalid permissions.');
    return {name,permissions:permissionKeys.filter(p=>body.permissions.includes(p))};
  }
  function assignedGroup(body) {
    const id=body.groupId;
    if(typeof id!=='string')fail(400,'Select a group.');
    const group=groupById(id);
    if(!group||group.id==='owner')fail(400,'Select a non-owner group.');
    return group;
  }
  function record(action,details,user) {audit(action,{...details,actor:user?.id??'automation'});}
  function endpoint(value) {
    const raw=required(value,512,'Webhook URL');
    let url;try{url=new URL(raw);}catch{fail(400,'Invalid webhook URL.');}
    if(url.protocol!=='https:'||url.hostname!=='discord.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/api\/webhooks\/[0-9]{10,30}\/[A-Za-z0-9_-]{20,200}$/.test(url.pathname))fail(400,'Use an HTTPS discord.com/api/webhooks/{id}/{token} endpoint without query parameters.');
    return url.href;
  }
  function eventKinds(value) {
    if(!Array.isArray(value)||value.some(kind=>!loggingKinds.includes(kind)))fail(400,'Invalid webhook logging categories.');
    return loggingKinds.filter(kind=>value.includes(kind));
  }
  const webhookRow=r=>({id:r.id,name:r.name,enabled:!!r.enabled,eventKinds:JSON.parse(r.event_kinds),createdAt:r.created,endpoint:`https://discord.com/api/webhooks/${new URL(r.url).pathname.split('/')[3]}/••••`});
  const triggerRow=r=>({id:r.id,name:r.name,...JSON.parse(r.config),enabled:!!r.enabled,status:r.enabled?'enabled':'disabled',createdAt:r.created});
  const groupRow=r=>({id:r.id,name:r.name,permissions:JSON.parse(r.permissions),builtin:!!r.builtin});
  const groupById=id=>db.prepare('SELECT * FROM au_groups WHERE id=?').get(id);
  const groupRole=g=>g.id==='owner'?'owner':JSON.parse(g.permissions).some(p=>p!=='read')?'admin':'viewer';
  const userRow=r=>{const g=groupById(r.group_id);return {id:r.id,name:r.name,role:g?groupRole(g):'viewer',groupId:g?.id??null,permissions:g?JSON.parse(g.permissions):[],passwordSet:!!r.password_hash,createdAt:r.created,revokedAt:r.revoked};};
  function getUser(id) {const r=db.prepare('SELECT * FROM au_users WHERE id=? AND revoked IS NULL').get(id);return r?userRow(r):null;}
  async function authenticate(password) {
    if(!validPassword(password))return null;
    const lookup=digest(password);
    const row=db.prepare('SELECT * FROM au_users WHERE password_lookup=? AND revoked IS NULL').get(lookup);
    const verified=await derive(password,row?.password_salt??dummy.salt);
    const matches=timingSafeEqual(verified,Buffer.from(row?.password_hash??dummy.hash,'hex'));
    if(!row||!matches)return null;
    const current=db.prepare('SELECT * FROM au_users WHERE id=? AND revoked IS NULL').get(row.id);
    if(!current||current.password_lookup!==lookup||current.password_hash!==row.password_hash||current.password_salt!==row.password_salt)return null;
    return userRow(current);
  }
  function config(body) {
    if(!object(body)||!kinds.includes(body.kind)||!['log','webhook'].includes(body.action)||typeof body.enabled!=='boolean')fail(400,'Invalid trigger configuration.');
    const conditions=body.conditions??{};
    if(!object(conditions)||Object.keys(conditions).some(k=>!['rule','severity','uid'].includes(k)))fail(400,'Invalid trigger conditions.');
    const result={kind:body.kind,action:body.action,conditions:{}};
    for(const k of ['rule','severity','uid'])if(conditions[k]!==undefined&&conditions[k]!=='')result.conditions[k]=required(conditions[k],160,k);
    if(result.conditions.severity&&!severities.includes(result.conditions.severity))fail(400,'Invalid severity.');
    if(body.action==='webhook') {
      if(!Number.isSafeInteger(body.webhookId)||!db.prepare('SELECT id FROM au_webhooks WHERE id=?').get(body.webhookId))fail(400,'Select an existing webhook.');
      result.webhookId=body.webhookId;
    }
    return result;
  }
  function evaluate(trigger,event) {
    const checks=[{field:'enabled',expected:true,actual:trigger.enabled},{field:'kind',expected:trigger.kind,actual:event.kind}];
    for(const [field,expected] of Object.entries(trigger.conditions))checks.push({field,expected,actual:field==='uid'?event.details?.uid??null:event[field]??null});
    return {matched:checks.every(c=>c.actual===c.expected),checks};
  }
  function safeText(value,max=256) {
    return String(value??'—').replace(/https?:\/\/(?:[^\s/]+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/[^\s]+/gi,'[redacted webhook]').slice(0,max)||'—';
  }
  function safeEvidence(value,depth=0) {
    if(depth>4)return '[depth limit]';
    if(Array.isArray(value))return value.slice(0,16).map(v=>safeEvidence(v,depth+1));
    if(object(value))return Object.fromEntries(Object.entries(value).slice(0,32).map(([key,v])=>[safeText(key,80),/password|secret|token|authorization|cookie|api.?key|private.?key|webhook|endpoint/i.test(key)?'[redacted]':safeEvidence(v,depth+1)]));
    return typeof value==='string'?safeText(value,1024):value;
  }
  function payload(trigger,event,server) {
    const details=event.details??{};
    const fields=[['Server',server.name],['Player',`${event.playerName||'—'} (${event.playerId??'—'})`],['Rule',event.rule],['Severity',event.severity],['Trust',details.trust??'Not supplied'],['Action',details.enforcement??details.action??'Not supplied'],['Event',`${event.kind} · ${event.key}`]].map(([name,value])=>({name,value:safeText(value),inline:true}));
    fields.push({name:'Evidence',value:safeText(JSON.stringify(safeEvidence(details)),1024)});
    return JSON.stringify({embeds:[{title:safeText(`AXIOM · ${trigger.name}`),fields}],allowed_mentions:{parse:[]}});
  }
  const deliveryKey=(webhookId,eventKey)=>JSON.stringify([webhookId,eventKey]);
  function execute(trigger,event,server,user) {
    const stamp=now();
    const inserted=db.prepare('INSERT OR IGNORE INTO au_executions(trigger_id,trigger_name,event_key,at,action,status,detail,finished) VALUES(?,?,?,?,?,?,?,?)').run(trigger.id,trigger.name,event.key,stamp,trigger.action,trigger.action==='log'?'logged':'queued',JSON.stringify({event:safeEvidence(event),server:safeText(server.name)}),trigger.action==='log'?stamp:null);
    if(!inserted.changes)return;
    const id=Number(inserted.lastInsertRowid);
    if(trigger.action==='webhook') {
      const hook=db.prepare('SELECT enabled FROM au_webhooks WHERE id=?').get(trigger.webhookId);
      const key=deliveryKey(trigger.webhookId,event.key),existing=db.prepare('SELECT id FROM au_executions WHERE delivery_key=?').get(key);
      if(!hook?.enabled)db.prepare('UPDATE au_executions SET status=?,detail=?,finished=? WHERE id=?').run('failed','Webhook is disabled or removed.',stamp,id);
      else if(existing)db.prepare('UPDATE au_executions SET status=?,detail=?,finished=? WHERE id=?').run('deduplicated',`Delivery already recorded by execution ${existing.id}.`,stamp,id);
      else {
        db.prepare('UPDATE au_executions SET delivery_key=? WHERE id=?').run(key,id);
        db.prepare('INSERT INTO au_outbox(execution_id,webhook_id,payload,next_attempt) VALUES(?,?,?,coalesce((SELECT max(next_attempt) FROM au_outbox WHERE webhook_id=?),0))').run(id,trigger.webhookId,payload(trigger,event,server),trigger.webhookId);
      }
    }
    record('trigger.execute',{id,triggerId:trigger.id,eventKey:event.key,action:trigger.action},user);
  }
  function ingest(server,events) {
    const triggers=db.prepare('SELECT * FROM au_triggers WHERE enabled=1').all().map(triggerRow);
    const hooks=server.capabilities?.luaBackend?[]:db.prepare('SELECT * FROM au_webhooks WHERE enabled=1').all().map(webhookRow);
    const seen=db.prepare('INSERT OR IGNORE INTO au_seen(key) VALUES(?)');
    db.exec('SAVEPOINT au_ingest');
    try {
      for(const event of events) {
        if(!seen.run(event.key).changes)continue;
        for(const trigger of triggers)if(evaluate(trigger,event).matched)execute(trigger,event,server);
        for(const hook of hooks)if(hook.eventKinds.includes(event.kind)&&!db.prepare('SELECT id FROM au_executions WHERE delivery_key=?').get(deliveryKey(hook.id,event.key)))execute({id:null,name:`Logger: ${hook.name}`,action:'webhook',webhookId:hook.id},event,server);
      }
      db.exec('RELEASE au_ingest');
    } catch(error) {db.exec('ROLLBACK TO au_ingest; RELEASE au_ingest');throw error;}
  }
  function eventById(id) {
    if(!Number.isSafeInteger(id))fail(400,'Select a recorded event.');
    const r=db.prepare('SELECT * FROM events WHERE id=?').get(id);
    if(!r)fail(404,'Event not found.');
    return {key:r.event_key,at:r.at,kind:r.kind,rule:r.rule,severity:r.severity,playerId:r.player_id,playerName:r.player_name,details:JSON.parse(r.details)};
  }
  function finishDelivery(row,status,detail) {
    db.exec('SAVEPOINT au_delivery');
    try {
      db.prepare('UPDATE au_executions SET status=?,detail=?,finished=? WHERE id=?').run(status,detail,now(),row.execution_id);
      db.prepare('DELETE FROM au_outbox WHERE id=?').run(row.id);
      record('webhook.delivery',{executionId:row.execution_id,webhookId:row.webhook_id,status,detail});
      db.exec('RELEASE au_delivery');
    } catch(error) {db.exec('ROLLBACK TO au_delivery; RELEASE au_delivery');throw error;}
  }
  function cancelDeliveries(webhookId) {
    for(const row of db.prepare('SELECT * FROM au_outbox WHERE webhook_id=?').all(webhookId))finishDelivery(row,'failed','Webhook is disabled or removed.');
  }
  let flushing=false;
  async function flush() {
    if(flushing)return;
    flushing=true;
    try {
      const rows=db.prepare('SELECT * FROM au_outbox WHERE next_attempt<=? ORDER BY id LIMIT 20').all(Date.parse(now()));
      for(const row of rows) {
        const pending=db.prepare('SELECT next_attempt FROM au_outbox WHERE id=? AND execution_id=?').get(row.id,row.execution_id);
        if(!pending||pending.next_attempt>Date.parse(now()))continue;
        const hook=db.prepare('SELECT * FROM au_webhooks WHERE id=?').get(row.webhook_id);
        if(!hook?.enabled){finishDelivery(row,'failed','Webhook is disabled or removed.');continue;}
        if(row.attempts>=maxAttempts){finishDelivery(row,'failed','Delivery retry limit reached; last outcome may be unknown.');continue;}
        let address;
        try {address=endpoint(hook.url);}catch {finishDelivery(row,'failed','Stored webhook endpoint is invalid.');continue;}
        const attempt=row.attempts+1;
        db.prepare('UPDATE au_outbox SET attempts=?,next_attempt=? WHERE id=?').run(attempt,Date.parse(now())+Math.min(300000,1000*2**(attempt-1)),row.id);
        db.prepare("UPDATE au_executions SET status='sending' WHERE id=?").run(row.execution_id);
        let delivered=false,retry=false,delay=Math.min(300000,1000*2**(attempt-1)),detail;
        try {
          const response=await fetch(address,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json'},body:row.payload});
          delivered=response.ok;retry=response.status===429||response.status>=500;detail=`Discord HTTP ${response.status}`;
          if(response.status===429) {
            const header=Number(response.headers.get('retry-after'));
            let seconds=Number.isFinite(header)?header:0;
            try {const body=await response.json();if(Number.isFinite(Number(body.retry_after)))seconds=Math.max(seconds,Number(body.retry_after));}catch {}
            if(seconds>0)delay=Math.max(delay,Math.min(86400000,Math.ceil(seconds*1000)));
            db.prepare('UPDATE au_outbox SET next_attempt=max(next_attempt,?) WHERE webhook_id=?').run(Date.parse(now())+delay,row.webhook_id);
          } else await response.body?.cancel();
        } catch(error) {retry=true;detail=error.name==='TimeoutError'?'Delivery timed out; outcome unknown.':'Delivery failed; endpoint/network error or redirect rejected.';}
        // A destination may be disabled or removed while its HTTP request is in flight.
        if(!db.prepare('SELECT id FROM au_outbox WHERE id=? AND execution_id=?').get(row.id,row.execution_id))continue;
        if(delivered)finishDelivery(row,'delivered',detail);
        else if(retry&&attempt<maxAttempts) {
          db.prepare('UPDATE au_outbox SET next_attempt=? WHERE id=?').run(Date.parse(now())+delay,row.id);
          db.prepare("UPDATE au_executions SET status='queued',detail=? WHERE id=?").run(`${detail} Retry ${attempt}/${maxAttempts} pending.`,row.execution_id);
        } else finishDelivery(row,'failed',`${detail}${retry?' Retry limit reached.':''}`);
      }
    } finally {flushing=false;}
  }
  async function routes(path,method,body,url,user) {
    if(!/^\/api\/(webhooks|triggers|trigger-debug|trigger-analytics|users|groups)(?:\/|$)/.test(path))return undefined;
    const access=/^\/api\/(users|groups)(?:\/|$)/.test(path);
    authorize(user,path.startsWith('/api/users')||(access&&method!=='GET'),method!=='GET');
    if(user.role!=='owner'&&!(user.permissions??defaults[user.role]).includes(method==='GET'?'read':'automation'))fail(403,'Insufficient permissions.');
    if(method!=='GET'&&method!=='POST')fail(405,'Use GET or POST.');
    if(method==='POST'&&!object(body))fail(400,'JSON object required.');
    if(path==='/api/groups'&&method==='GET')return {groups:db.prepare('SELECT * FROM au_groups ORDER BY builtin DESC,name COLLATE NOCASE,id').all().map(groupRow),permissionKeys};
    if(path==='/api/groups'&&method==='POST') {
      const value=groupConfig(body),id=`group_${randomBytes(12).toString('hex')}`;
      db.prepare('INSERT INTO au_groups(id,name,permissions) VALUES(?,?,?)').run(id,value.name,JSON.stringify(value.permissions));
      record('group.create',{id,...value},user);return {group:groupRow(groupById(id))};
    }
    const groupMatch=path.match(/^\/api\/groups\/([A-Za-z0-9_-]+)(?:\/(remove))?$/);
    if(groupMatch&&method==='POST') {
      const id=groupMatch[1],group=groupById(id);
      if(!group)fail(404,'Group not found.');
      if(group.builtin)fail(403,'Built-in groups cannot be changed.');
      if(groupMatch[2]) {
        if(db.prepare('SELECT id FROM au_users WHERE group_id=? LIMIT 1').get(id))fail(409,'Reassign users in this group first, including revoked users.');
        db.prepare('DELETE FROM au_groups WHERE id=?').run(id);
      } else {
        const value=groupConfig(body);
        db.prepare('UPDATE au_groups SET name=?,permissions=? WHERE id=?').run(value.name,JSON.stringify(value.permissions),id);
      }
      record(`group.${groupMatch[2]||'update'}`,{id},user);return {ok:true};
    }
    if(path==='/api/users'&&method==='GET')return {users:db.prepare('SELECT * FROM au_users ORDER BY id DESC').all().map(userRow)};
    if(path==='/api/users'&&method==='POST') {
      const name=required(body.name,80,'Name');
      assignedGroup(body);
      const fields=await passwordFields(body.password),group=assignedGroup(body);
      uniquePassword(fields.lookup);
      const r=db.prepare('INSERT INTO au_users(name,role,group_id,password_lookup,password_salt,password_hash,created) VALUES(?,?,?,?,?,?,?)').run(name,groupRole(group),group.id,fields.lookup,fields.salt,fields.hash,now());
      const id=Number(r.lastInsertRowid);record('user.create',{id,name,groupId:group.id},user);
      return {user:getUser(id)};
    }
    const passwordMatch=path.match(/^\/api\/users\/(\d+)\/password$/);
    if(passwordMatch&&method==='POST') {
      const id=Number(passwordMatch[1]);
      if(!getUser(id))fail(404,'Active user not found.');
      const fields=await passwordFields(body.password);
      const current=getUser(id);
      if(!current)fail(404,'Active user not found.');
      uniquePassword(fields.lookup,id);
      db.prepare('UPDATE au_users SET password_lookup=?,password_salt=?,password_hash=? WHERE id=? AND revoked IS NULL').run(fields.lookup,fields.salt,fields.hash,id);
      invalidateSessions(id);
      if(current.groupId==='owner')onOwnerPasswordReset();
      record('user.password',{id},user);return {ok:true};
    }
    const userMatch=path.match(/^\/api\/users\/(\d+)$/);
    if(userMatch&&method==='POST') {
      const id=Number(userMatch[1]),existing=db.prepare('SELECT * FROM au_users WHERE id=?').get(id);
      if(!existing)fail(404,'User not found.');
      if(existing.group_id==='owner'&&body.groupId!==undefined&&body.groupId!=='owner')fail(403,'Owner access cannot be changed.');
      const name=required(body.name,80,'Name'),group=existing.group_id==='owner'?groupById('owner'):assignedGroup(body);
      db.prepare('UPDATE au_users SET name=?,role=?,group_id=? WHERE id=?').run(name,groupRole(group),group.id,id);
      record('user.update',{id,name,groupId:group.id},user);return {user:userRow({...existing,name,group_id:group.id})};
    }
    let match=path.match(/^\/api\/users\/(\d+)\/revoke$/);
    if(match&&method==='POST') {
      const id=Number(match[1]);
      if(db.prepare("SELECT id FROM au_users WHERE id=? AND group_id='owner'").get(id))fail(403,'Owner access cannot be revoked.');
      if(!db.prepare('UPDATE au_users SET revoked=? WHERE id=? AND revoked IS NULL').run(now(),id).changes)fail(404,'Active user not found.');
      invalidateSessions(id);
      record('user.revoke',{id},user);return {ok:true};
    }
    if(path==='/api/webhooks'&&method==='GET')return {webhooks:db.prepare('SELECT * FROM au_webhooks ORDER BY id DESC').all().map(webhookRow)};
    if(path==='/api/webhooks'&&method==='POST') {
      const name=required(body.name,80,'Name'),address=endpoint(body.url),selected=eventKinds(body.eventKinds??[]);
      if(typeof body.enabled!=='boolean')fail(400,'Enabled must be a boolean.');
      const r=db.prepare('INSERT INTO au_webhooks(name,url,enabled,created,event_kinds) VALUES(?,?,?,?,?)').run(name,address,+body.enabled,now(),JSON.stringify(selected));
      const id=Number(r.lastInsertRowid);record('webhook.create',{id,name},user);return {id};
    }
    match=path.match(/^\/api\/webhooks\/(\d+)(?:\/(test|remove))?$/);
    if(match&&method==='POST') {
      const id=Number(match[1]),hook=db.prepare('SELECT * FROM au_webhooks WHERE id=?').get(id);
      if(!hook)fail(404,'Webhook not found.');
      if(match[2]==='remove') {
        const used=db.prepare('SELECT * FROM au_triggers').all().some(r=>JSON.parse(r.config).webhookId===id);
        if(used)fail(409,'Remove or change triggers using this webhook first.');
        db.prepare('DELETE FROM au_webhooks WHERE id=?').run(id);
        cancelDeliveries(id);
      } else if(match[2]==='test') {
        if(!hook.enabled)fail(409,'Enable webhook before sending a test.');
        db.exec('SAVEPOINT au_test');
        try {
          execute({id:null,name:`Webhook test: ${hook.name}`,action:'webhook',webhookId:id},{key:`test:${randomBytes(12).toString('hex')}`,kind:'system',severity:'info',playerName:'',rule:'Explicit delivery test'}, {name:'AXIOM control panel'},user);
          db.exec('RELEASE au_test');
        } catch(error) {db.exec('ROLLBACK TO au_test; RELEASE au_test');throw error;}
      } else {
        const name=required(body.name,80,'Name'),address=body.url===undefined||body.url===''?hook.url:endpoint(body.url),selected=eventKinds(body.eventKinds??JSON.parse(hook.event_kinds));
        if(typeof body.enabled!=='boolean')fail(400,'Enabled must be a boolean.');
        db.prepare('UPDATE au_webhooks SET name=?,url=?,enabled=?,event_kinds=? WHERE id=?').run(name,address,+body.enabled,JSON.stringify(selected),id);
        if(!body.enabled)cancelDeliveries(id);
      }
      record(`webhook.${match[2]||'update'}`,{id},user);return {ok:true,queued:match[2]==='test'};
    }
    if(path==='/api/triggers'&&method==='GET')return {triggers:db.prepare('SELECT * FROM au_triggers ORDER BY id DESC').all().map(triggerRow)};
    if(path==='/api/triggers'&&method==='POST') {
      const name=required(body.name,80,'Name'),value=config(body);
      const r=db.prepare('INSERT INTO au_triggers(name,config,enabled,created) VALUES(?,?,?,?)').run(name,JSON.stringify(value),+body.enabled,now());
      const id=Number(r.lastInsertRowid);record('trigger.create',{id,name},user);return {id};
    }
    match=path.match(/^\/api\/triggers\/(\d+)(?:\/(remove|clone))?$/);
    if(match&&method==='POST') {
      const id=Number(match[1]);
      const source=db.prepare('SELECT * FROM au_triggers WHERE id=?').get(id);
      if(!source)fail(404,'Trigger not found.');
      if(match[2]==='clone') {
        const name=`${source.name.slice(0,73)} (copy)`;
        const cloned=db.prepare('INSERT INTO au_triggers(name,config,enabled,created) VALUES(?,?,0,?)').run(name,source.config,now());
        const cloneId=Number(cloned.lastInsertRowid);record('trigger.clone',{id:cloneId,sourceId:id},user);return {id:cloneId};
      }
      if(match[2]==='remove')db.prepare('DELETE FROM au_triggers WHERE id=?').run(id);
      else {
        const name=required(body.name,80,'Name'),value=config(body);
        db.prepare('UPDATE au_triggers SET name=?,config=?,enabled=? WHERE id=?').run(name,JSON.stringify(value),+body.enabled,id);
      }
      record(`trigger.${match[2]||'update'}`,{id},user);return {ok:true};
    }
    if(path==='/api/trigger-debug'&&method==='GET') {
      const executions=db.prepare('SELECT id,trigger_id triggerId,trigger_name triggerName,event_key eventKey,at,action,status,detail,finished FROM au_executions ORDER BY id DESC LIMIT 200').all();
      const events=db.prepare('SELECT id,event_key eventKey,at,kind,rule,severity,player_name playerName FROM events ORDER BY id DESC LIMIT 200').all();
      return {executions,events};
    }
    if(path==='/api/trigger-debug'&&method==='POST') {
      if(!Number.isSafeInteger(body.triggerId))fail(400,'Select a trigger.');
      const row=db.prepare('SELECT * FROM au_triggers WHERE id=?').get(body.triggerId);
      if(!row)fail(404,'Trigger not found.');
      const trigger=triggerRow(row),event=eventById(body.eventId),result=evaluate(trigger,event);
      return {...result,triggerId:trigger.id,eventKey:event.key,action:trigger.action,webhookId:trigger.webhookId??null,delivery:false};
    }
    if(path==='/api/trigger-analytics'&&method==='GET') {
      const range=url.searchParams.get('range')??'all',triggerId=url.searchParams.get('triggerId')??'';
      const days={'24h':1,'7d':7,'30d':30,all:null};
      if(!Object.hasOwn(days,range))fail(400,'Invalid analytics range.');
      if(triggerId&&(!/^[1-9][0-9]*$/.test(triggerId)||!Number.isSafeInteger(Number(triggerId))))fail(400,'Invalid trigger filter.');
      const clauses=[],params=[];
      if(days[range]!==null){clauses.push('at>=?');params.push(new Date(Date.parse(now())-days[range]*86400000).toISOString());}
      if(triggerId){clauses.push('trigger_id=?');params.push(Number(triggerId));}
      const where=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
      return {
        range,triggerId:triggerId?Number(triggerId):null,
        totals:db.prepare(`SELECT status,count(*) count FROM au_executions${where} GROUP BY status`).all(...params),
        triggers:db.prepare(`SELECT trigger_id triggerId,trigger_name triggerName,action,status,count(*) count,max(at) lastExecution FROM au_executions${where} GROUP BY trigger_id,trigger_name,action,status ORDER BY lastExecution DESC`).all(...params),
        daily:db.prepare(`SELECT substr(at,1,10) day,status,count(*) count FROM au_executions${where} GROUP BY day,status ORDER BY day DESC`).all(...params),
        availableTriggers:db.prepare('SELECT id,name FROM au_triggers UNION ALL SELECT e.trigger_id id,e.trigger_name name FROM au_executions e WHERE e.trigger_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM au_triggers t WHERE t.id=e.trigger_id) AND e.id=(SELECT max(x.id) FROM au_executions x WHERE x.trigger_id=e.trigger_id) ORDER BY name').all()
      };
    }
    fail(404,'Automation endpoint not found.');
  }
  return {routes,ingest,flush,authenticate,getUser,validUser:id=>!!getUser(id)};
}
