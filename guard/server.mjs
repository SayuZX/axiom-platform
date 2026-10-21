// JavaScript, server.mjs, Node 24, Windows x64 / macOS.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, existsSync, renameSync, rmSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createManagement } from './management.mjs';
import { createAutomation } from './automation.mjs';
import { createProtection } from './protection.mjs';
import { createFullConfig } from './fullconfig.mjs';
import { createLogs } from './logs.mjs';
import { createDrains } from './drains.mjs';
import { runScript } from './script-worker.mjs';
import { createResourceControl } from './resource-control.mjs';
import { auditDistribution } from './distribution-audit.mjs';
import { createNuiAuth } from './nui-auth.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(process.env.GUARD_DATA || join(root, 'data'));
mkdirSync(data, { recursive: true, mode: 0o700 });
const secretPath = join(data, 'credentials.json');
const ownerPasswordPath = join(data, 'owner-password.txt');
function writePrivateFile(path,value) {
  const temporary=`${path}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary,value,{mode:0o600,flag:'wx',flush:true});
    renameSync(temporary,path);
  } finally {rmSync(temporary,{force:true});}
}
if (!existsSync(secretPath)) {
  if(existsSync(join(data,'guard.sqlite')))throw new Error('Missing credentials.json for existing data; restore credentials before starting.');
  writePrivateFile(secretPath,JSON.stringify({passwordKey:randomBytes(32).toString('hex'),ingestToken:randomBytes(32).toString('base64url')},null,2));
}
chmodSync(secretPath,0o600);
const secrets = JSON.parse(readFileSync(secretPath, 'utf8'));
if (!object(secrets)||typeof secrets.ingestToken!=='string'||secrets.ingestToken.length<32)throw new Error('Invalid ingestToken');
const port = Number(process.env.PORT || 3013);
const origin = process.env.GUARD_ORIGIN || `http://127.0.0.1:${port}`;
const secure = new URL(origin).protocol === 'https:';
const prefix = '/anticheat';
const nuiOrigin='https://cfx-nui-axiom_guard';
const db = new DatabaseSync(join(data, 'guard.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,at TEXT NOT NULL,kind TEXT NOT NULL,player_id INTEGER,player_name TEXT NOT NULL,rule TEXT NOT NULL,severity TEXT NOT NULL,details TEXT NOT NULL,reviewed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS events_at ON events(at);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL);`);
if(secrets.passwordKey===undefined) {
  const usersExist=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='au_users'").get();
  if(usersExist&&db.prepare('PRAGMA table_info(au_users)').all().some(c=>c.name==='password_hash')&&db.prepare('SELECT id FROM au_users WHERE password_hash IS NOT NULL LIMIT 1').get())throw new Error('Missing passwordKey for existing passwords; restore credentials.json.');
  secrets.passwordKey=randomBytes(32).toString('hex');
  writePrivateFile(secretPath,JSON.stringify(secrets,null,2));
}
if(typeof secrets.passwordKey!=='string'||secrets.passwordKey.length<32||secrets.passwordKey.includes('\0'))throw new Error('Invalid passwordKey');
let bootstrapFromEnvironment=false;
function bootstrapOwnerPassword() {
  if(process.env.GUARD_OWNER_PASSWORD!==undefined) {bootstrapFromEnvironment=true;return process.env.GUARD_OWNER_PASSWORD;}
  if(existsSync(ownerPasswordPath)) {chmodSync(ownerPasswordPath,0o600);return readFileSync(ownerPasswordPath,'utf8');}
  const password=randomBytes(32).toString('base64url');
  writePrivateFile(ownerPasswordPath,password);
  return password;
}
const defaults = {mode:'monitor',explosionLimit:12,entityLimit:35,particleLimit:25,projectileLimit:30,damageLimit:500,heartbeatTimeout:45};
const ranges = {explosionLimit:[1,1000],entityLimit:[1,1000],particleLimit:[1,1000],projectileLimit:[1,1000],damageLimit:[1,10000],heartbeatTimeout:[15,300]};
function fail(status, message) { throw Object.assign(new Error(message), {status}); }
function validateConfig(value) {
  if (!value || typeof value !== 'object' || !['monitor','protect'].includes(value.mode)) fail(400, 'Mode tidak valid.');
  if (Object.keys(value).some(key => !Object.hasOwn(defaults,key))) fail(400, 'Kolom konfigurasi tidak dikenal.');
  const result = {mode:value.mode};
  for (const [key,[min,max]] of Object.entries(ranges)) {
    if (!Number.isInteger(value[key]) || value[key]<min || value[key]>max) fail(400, `${key}: ${min}–${max}.`);
    result[key]=value[key];
  }
  return result;
}
db.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify(defaults));
let config=validateConfig(JSON.parse(db.prepare('SELECT value FROM settings WHERE id=1').get().value));
const sessions=new Map(), attempts=new Map();
let live={name:'AXIOM Roleplay',uptime:0,resourceVersion:'',players:[]}, lastSeen=null;
let native={ok:null,checked:0,violations:[],checkedAt:null,engine:'Objective-C + x64 assembly'};
let scanning=null;
const rules=[
  ['explosion_rate','Explosion burst','Ledakan per pemain per 10 detik.'],
  ['entity_rate','Entity burst','Pembuatan entity per pemain per 10 detik.'],
  ['particle_rate','Particle burst','Particle FX per pemain per 10 detik.'],
  ['projectile_rate','Projectile burst','Proyektil per pemain per 10 detik.'],
  ['weapon_damage','Damage override','Damage eksplisit di atas batas.'],
  ['client_observation','Client observations','Health, armor, invincibility: bukti tidak tepercaya, tanpa enforcement.'],
  ['heartbeat_missing','Heartbeat missing','Sinyal client terputus; observasi, bukan bukti cheat.']
].map(([id,label,description])=>({id,label,description}));
const now=()=>new Date().toISOString();
const hash=value=>createHash('sha256').update(value).digest();
const equal=(a,b)=>typeof a==='string' && timingSafeEqual(hash(a),hash(b));
const audit=(action,details)=>db.prepare('INSERT INTO audit(at,action,details) VALUES(?,?,?)').run(now(),action,JSON.stringify(details));
const getLive=()=>{const online=lastSeen!==null&&Date.now()-Date.parse(lastSeen)<15000;return {...live,players:online?live.players:[],online,lastSeen};};
const moduleContext={db,fail,text,audit,now,getLive,getMode:()=>config.mode};
const fullconfig=createFullConfig({...moduleContext,getBase:()=>config,setBase:value=>{const checked=validateConfig(value);db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(checked));config=checked;}});
const management=createManagement(moduleContext);
const automation=await createAutomation({...moduleContext,passwordKey:secrets.passwordKey,ownerPassword:bootstrapOwnerPassword,
  invalidateSessions:id=>{for(const [key,value] of sessions)if(value.user.id===id)sessions.delete(key);},
  onOwnerPasswordReset:()=>rmSync(ownerPasswordPath,{force:true})});
if(bootstrapFromEnvironment)rmSync(ownerPasswordPath,{force:true});
if(Object.hasOwn(secrets,'adminToken')) {delete secrets.adminToken;writePrivateFile(secretPath,JSON.stringify(secrets,null,2));}
const logs=createLogs(moduleContext);
const drains=createDrains(moduleContext);
const protection=createProtection({...moduleContext,addBan:management.addBan,getFullConfig:()=>fullconfig.snapshot(),runScript});
const resourceControl=createResourceControl(moduleContext);
const nuiAuth=createNuiAuth({sessions,getLive,fail,audit,now,adminUser:player=>({id:`fivem:${player.serverSession}:${player.playerSession}`,name:player.name||player.playerName,role:'admin',groupId:'admin',permissions:JSON.parse(db.prepare("SELECT permissions FROM au_groups WHERE id='admin'").get().permissions)})});
const eventRow=row=>({id:row.id,at:row.at,kind:row.kind,playerId:row.player_id,playerName:row.player_name,rule:row.rule,severity:row.severity,details:JSON.parse(row.details),reviewed:!!row.reviewed});
function session(req) {
  const bearer=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  const nui=req.headers.origin===nuiOrigin;
  const id=nui?bearer:(req.headers.cookie||'').match(/(?:^|;\s*)axiom_guard=([A-Za-z0-9_-]+)/)?.[1];
  const value=sessions.get(id);
  if (!value || value.expires<Date.now()) { sessions.delete(id); return null; }
  if((value.transport==='nui')!==nui)return null;
  const updated=value.native?nuiAuth.validate(value):automation.getUser(value.user.id);
  if(!updated){sessions.delete(id);return null;}
  value.user=updated;
  return {...value,id};
}
function text(value,max,label) {
  if(typeof value!=='string'||value.length>max||value.includes('\0')) fail(400,`${label} tidak valid.`);
  return value;
}
function object(value) { return value!==null && typeof value==='object' && !Array.isArray(value); }
function validateIngest(body) {
  if(!object(body)||!object(body.server)||!Array.isArray(body.events)||body.events.length>100) fail(400,'Payload telemetry tidak valid.');
  const s=body.server;
  if(!Array.isArray(s.players)||s.players.length>2048||!Number.isFinite(s.uptime)||s.uptime<0) fail(400,'Server telemetry tidak valid.');
  const players=s.players.map(p=>{
    if(!object(p)||!Number.isInteger(p.id)||p.id<1||!Number.isFinite(p.ping)||p.ping<0||!Array.isArray(p.identifiers)||p.identifiers.length>32) fail(400,'Player tidak valid.');
    const position=p.position===null||p.position===undefined?null:p.position;
    if(position&&(!object(position)||!['x','y','z'].every(k=>Number.isFinite(position[k])&&Math.abs(position[k])<1e7)))fail(400,'Posisi tidak valid.');
    for(const field of ['health','armor'])if(p[field]!=null&&(!Number.isFinite(p[field])||Math.abs(p[field])>1e7))fail(400,'Status pemain tidak valid.');
    return {id:p.id,name:text(p.name,128,'name'),ping:p.ping,identifiers:p.identifiers.map(i=>text(i,160,'identifier')),sessionId:text(p.sessionId||'',160,'session'),position,health:p.health??null,armor:p.armor??null,dashboardAdmin:p.dashboardAdmin===true};
  });
  if(new Set(players.map(p=>p.id)).size!==players.length) fail(400,'Player duplikat.');
  const events=body.events.map(e=>{
    if(!object(e)||!['detection','connection','disconnection','system'].includes(e.kind)||!['info','low','medium','high'].includes(e.severity)) fail(400,'Event tidak valid.');
    if(e.playerId!==null && (!Number.isInteger(e.playerId)||e.playerId<1)) fail(400,'Player ID tidak valid.');
    const stamp=Date.parse(e.at);
    if(!Number.isFinite(stamp)||stamp>Date.now()+60000||stamp<Date.now()-86400000*7) fail(400,'Waktu event tidak valid.');
    if(!object(e.details)||JSON.stringify(e.details).length>8192) fail(400,'Detail event tidak valid.');
    return {key:text(e.key,160,'key'),at:new Date(stamp).toISOString(),kind:e.kind,playerId:e.playerId,playerName:text(e.playerName,128,'playerName'),rule:text(e.rule,80,'rule'),severity:e.severity,details:e.details};
  });
  const resources=s.resources||[];
  if(!Array.isArray(resources)||resources.length>4096||resources.some(r=>!object(r)))fail(400,'Resources tidak valid.');
  const capabilities={screenshots:s.capabilities?.screenshots===true,presets:s.capabilities?.presets===true,kick:s.capabilities?.kick===true,scripts:s.capabilities?.scripts===true,luaBackend:s.capabilities?.luaBackend===true};
  if(s.luaBans!==undefined&&(!capabilities.luaBackend||!Array.isArray(s.luaBans)||s.luaBans.length>128))fail(400,'Invalid Lua ban batch.');
  const luaBans=(s.luaBans||[]).map(b=>{
    if(!object(b)||!/^lua-[1-9][0-9]*$/.test(b.id)||!Array.isArray(b.identifiers)||b.identifiers.length>256||b.identifiers.some(i=>typeof i!=='string'||i.length>160)||!Number.isFinite(Date.parse(b.createdAt)))fail(400,'Invalid Lua ban record.');
    for(const key of ['expiresAt','revokedAt'])if(b[key]!=null&&!Number.isFinite(Date.parse(b[key])))fail(400,'Invalid Lua ban time.');
    if(b.evidence!==undefined&&(!object(b.evidence)||JSON.stringify(b.evidence).length>32768))fail(400,'Invalid Lua ban evidence.');
    return {id:b.id,name:text(b.name||'',128,'ban name'),reason:text(b.reason,2048,'ban reason'),createdAt:b.createdAt,expiresAt:b.expiresAt||null,revokedAt:b.revokedAt||null,identifiers:b.identifiers,evidence:b.evidence||{}};
  });
  const results=body.results||[];
  if(!Array.isArray(results)||results.length>32)fail(400,'Hasil perintah tidak valid.');
  for(const result of results){
    if(!object(result)||!['completed','failed'].includes(result.status))fail(400,'Status perintah tidak valid.');
    if(typeof result.id!=='string'||!/^[a-f0-9]{32}$/.test(result.id))fail(400,'ID perintah tidak valid.');
    text(result.message||'',512,'message');
    if(typeof result.key!=='string'||!/^[a-f0-9]{64}$/.test(result.key))fail(400,'Receipt key tidak valid.');
    text(result.playerSession,160,'player session');text(result.serverSession,160,'server session');
    if(result.data!==undefined&&JSON.stringify(result.data).length>8192)fail(400,'Hasil terlalu besar.');
  }
  return {server:{name:text(s.name,128,'server'),sessionId:text(s.sessionId||'',160,'session'),uptime:s.uptime,resourceVersion:text(s.resourceVersion,32,'version'),mode:s.mode==='protect'?'protect':'monitor',players,resources:resources.map(r=>({name:text(r.name,128,'resource'),state:text(r.state,32,'state')})),capabilities,luaBans},events,results};
}
const insertEvent=db.prepare('INSERT OR IGNORE INTO events(event_key,at,kind,player_id,player_name,rule,severity,details) VALUES(?,?,?,?,?,?,?,?)');
function ingest(body) {
  const value=validateIngest(body);
  db.exec('BEGIN');
  try {
    management.ingest(value.server,value.events);
    fullconfig.remember(value.server.players);
    for(const e of value.events) insertEvent.run(e.key,e.at,e.kind,e.playerId,e.playerName,e.rule,e.severity,JSON.stringify(e.details));
    automation.ingest(value.server,value.events);
    drains.ingest(value.server,value.events);
    protection.ingest(value.server,value.events);
    protection.results(value.results,value.server);
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
  live=value.server; lastSeen=now();
}
function state() {
  const since=new Date(Date.now()-86400000).toISOString();
  const counts=Object.fromEntries(db.prepare('SELECT kind,count(*) n FROM events WHERE at>=? GROUP BY kind').all(since).map(r=>[r.kind,r.n]));
  const hourly=[];
  const rows=db.prepare("SELECT substr(at,1,13) hour,kind,count(*) n FROM events WHERE at>=? GROUP BY hour,kind").all(since);
  const indexed=new Map();
  for(const row of rows) indexed.set(`${row.hour}:${row.kind}`,row.n);
  const current=Math.floor(Date.now()/3600000)*3600000;
  for(let i=23;i>=0;i--) {
    const hour=new Date(current-i*3600000).toISOString();
    const key=hour.slice(0,13);
    hourly.push({hour,connections:indexed.get(`${key}:connection`)||0,disconnections:indexed.get(`${key}:disconnection`)||0,detections:indexed.get(`${key}:detection`)||0});
  }
  const online=lastSeen!==null && Date.now()-Date.parse(lastSeen)<15000;
  return {server:{...live,players:online?live.players:[],mode:online?live.mode:'monitor',online,lastSeen},stats:{connections:counts.connection||0,disconnections:counts.disconnection||0,detections:counts.detection||0,players:online?live.players.length:0},management:management.summary(),hourly,native,config,rules,
    reasons:db.prepare("SELECT rule,count(*) count FROM events WHERE at>=? AND kind='detection' GROUP BY rule ORDER BY count DESC LIMIT 20").all(since),
    recent:db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 10').all().map(eventRow)};
}
const execute=promisify(execFile);
let publicationReport=null,publicationAt=0;
async function scanNative() {
  if(scanning) return scanning;
  scanning=(async()=>{
    const executable=process.env.GUARD_NATIVE || join(root,'native','guard-integrity.exe');
    const manifest=process.env.GUARD_MANIFEST || join(data,'integrity.manifest');
    const target=process.env.GUARD_RESOURCE;
    try {
      if(!target) throw new Error('GUARD_RESOURCE belum dikonfigurasi.');
      let result;
      try { result=await execute(executable,['scan',manifest,target],{timeout:30000,maxBuffer:1048576,windowsHide:true}); }
      catch(error) { if((error.code===1||error.code===2) && error.stdout) result=error; else throw error; }
      const report=JSON.parse(result.stdout);
      if(typeof report.ok!=='boolean'||!Number.isInteger(report.checked)||!Array.isArray(report.violations)) throw new Error('Output native tidak valid.');
      if(report.error) throw new Error(report.error);
      native={...report,checkedAt:now(),engine:'Objective-C + x64 assembly'};
      if(Date.now()-publicationAt>60000||!publicationReport){
        try{publicationReport=await auditDistribution({metadataPath:join(target,'server','data','distribution-metadata.json'),executable,outputDir:data});publicationAt=Date.now();}
        catch(error){publicationReport={ok:null,error:error.message,checkedAt:now()};}
      }
      native.publication=publicationReport;
    } catch(error) { native={ok:null,checked:0,violations:[],checkedAt:now(),engine:'Objective-C + x64 assembly',error:error.message}; }
    return native;
  })().finally(()=>{scanning=null;});
  return scanning;
}
async function readJson(req,maximum=524288,objectRequired=true) {
  if(!String(req.headers['content-type']||'').startsWith('application/json')) fail(415,'Gunakan application/json.');
  let size=0; const parts=[];
  for await(const part of req) {
    size+=part.length;
    if(size>maximum) fail(413,'Payload terlalu besar.');
    parts.push(part);
  }
  let value;
  try {value=JSON.parse(Buffer.concat(parts).toString('utf8'));} catch {fail(400,'JSON tidak valid.');}
  if(objectRequired&&!object(value))fail(400,'JSON object required.');
  return value;
}
function send(res,status,value,headers={}) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
  res.end(JSON.stringify(value));
}
function cookie(id,age) { return `axiom_guard=${id}; Path=/anticheat/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`; }
const staticFiles=new Map([['/', ['index.html','text/html']],['/index.html',['index.html','text/html']],['/styles.css',['styles.css','text/css']],['/app.js',['app.js','text/javascript']]]);
for(const module of ['management','automation','protection','fullconfig','logs','drains','resource-control'])for(const [ext,mime] of [['js','text/javascript'],['css','text/css']])staticFiles.set(`/${module}.${ext}`,[`${module}.${ext}`,mime]);
for(const weight of [400,500,600,700,800])staticFiles.set(`/montserrat-${weight}.ttf`,[`montserrat-${weight}.ttf`,'font/ttf']);
staticFiles.set('/nui.js',['nui.js','text/javascript']);
staticFiles.set('/compact.css',['compact.css','text/css']);
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname===prefix) {res.writeHead(308,{Location:prefix+'/'});res.end();return;}
    if(!url.pathname.startsWith(prefix+'/')) fail(404,'Tidak ditemukan.');
    const path=url.pathname.slice(prefix.length), method=req.method;
    const nui=req.headers.origin===nuiOrigin;
    const machinePath=['/api/ingest','/api/media','/api/admission','/api/nui-ticket','/api/nui-revoke'].includes(path);
    if(nui&&path.startsWith('/api/')&&!machinePath){
      res.setHeader('Access-Control-Allow-Origin',nuiOrigin);res.setHeader('Vary','Origin');
      if(method==='OPTIONS'){
        const requested=req.headers['access-control-request-method'];
        const headers=String(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
        if(!['GET','POST'].includes(requested)||headers.some(h=>!['authorization','content-type','x-csrf-token'].includes(h)))fail(403,'NUI preflight denied.');
        res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Authorization, Content-Type, X-CSRF-Token','Access-Control-Max-Age':'600'});res.end();return;
      }
    }
    if(nui&&machinePath)fail(403,'Server-only endpoint.');
    if(method==='GET'&&staticFiles.has(path)) {
      const [file,type]=staticFiles.get(path);
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache'});
      res.end(readFileSync(join(root,'public',file))); return;
    }
    if(path==='/api/health'&&method==='GET') return send(res,200,{ok:true});
    if(path==='/api/ingest'&&method==='POST') {
      if(req.headers['x-forwarded-for'] || !equal(req.headers.authorization,`Bearer ${secrets.ingestToken}`)) fail(401,'Telemetry tidak diizinkan.');
      ingest(await readJson(req));return send(res,200,{config,fullConfig:fullconfig.snapshot(),protection:protection.policy(),bans:management.policy(),commands:protection.commands(live),webhooks:db.prepare('SELECT id,name,url,event_kinds,enabled FROM au_webhooks').all().map(h=>({id:h.id,name:h.name,url:h.url,eventKinds:JSON.parse(h.event_kinds),enabled:!!h.enabled}))});
    }
    if(path==='/api/media'&&method==='POST'){
      if(req.headers['x-forwarded-for']||!equal(req.headers.authorization,`Bearer ${secrets.ingestToken}`))fail(401,'Media tidak diizinkan.');
      return send(res,200,await protection.receiveMedia(await readJson(req,8*1024*1024)));
    }
    if(path==='/api/admission'&&method==='POST'){
      if(req.headers['x-forwarded-for']||!equal(req.headers.authorization,`Bearer ${secrets.ingestToken}`))fail(401,'Admission tidak diizinkan.');
      return send(res,200,await fullconfig.admit(await readJson(req)));
    }
    if((path==='/api/nui-ticket'||path==='/api/nui-revoke')&&method==='POST'){
      if(req.headers['x-forwarded-for']||req.headers.origin||!equal(req.headers.authorization,`Bearer ${secrets.ingestToken}`))fail(401,'Native login issuance is server-only.');
      const body=await readJson(req,4096);
      return send(res,200,path==='/api/nui-ticket'?nuiAuth.issue(body):nuiAuth.revoke(body));
    }
    if(path==='/api/nui-session'&&method==='POST'){
      if(!nui)fail(403,'Native session origin required.');
      return send(res,200,nuiAuth.redeem(await readJson(req,1024)));
    }
    if(method!=='GET' && req.headers.origin && req.headers.origin!==origin && !nui) fail(403,'Origin ditolak.');
    const auth=session(req);
    if(path==='/api/session'&&method==='GET')return send(res,200,auth?{authenticated:true,csrf:auth.csrf,user:auth.user}:{authenticated:false});
    if(path==='/api/login'&&method==='POST') {
      if(nui)fail(403,'Use /axiomguard for automatic native admin authentication.');
      const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).slice(0,200);
      const entry=attempts.get(ip);
      if(entry && entry.until>Date.now() && entry.count>=10) fail(429,'Terlalu banyak percobaan. Tunggu 15 menit.');
      attempts.set(ip,{until:Date.now()+900000,count:entry&&entry.until>Date.now()?entry.count+1:1});
      const value=await readJson(req,4096,false);
      if(value?.transport==='nui')fail(403,'Password login is web-only.');
      const user=await automation.authenticate(object(value)?value.password:undefined);
      if(!user)fail(401,'Password tidak valid.');
      attempts.delete(ip);
      if(auth) sessions.delete(auth.id);
      if(sessions.size>=100) sessions.delete(sessions.keys().next().value);
      const id=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');
      sessions.set(id,{csrf,user,transport:'web',expires:Date.now()+28800000});audit('login',{actor:user.name,userId:user.id,transport:'web'});
      return send(res,200,{csrf,user},{'Set-Cookie':cookie(id,28800)});
    }
    if(!auth) fail(401,'Sesi berakhir. Masuk kembali.');
    if(method!=='GET'&&!equal(req.headers['x-csrf-token'],auth.csrf)) fail(403,'CSRF token tidak valid.');
    if(/^\/api\/resources(?:\/|$)/.test(path))return send(res,200,await resourceControl.routes(path,method,method==='GET'?undefined:await readJson(req),url,auth.user));
    if(path==='/api/logout'&&method==='POST') {
      sessions.delete(auth.id); return send(res,200,{ok:true},nui?{}:{'Set-Cookie':cookie('',0)});
    }
    if(method!=='GET'&&auth.user.role==='viewer')fail(403,'Viewer access is read-only.');
    if(auth.user.role!=='owner'){
      const permissions=auth.user.permissions||[];
      const ownerArea=/^\/api\/(users|groups)(?:\/|$)/.test(path);
      const area=/^\/api\/(webhooks|triggers|trigger-debug|trigger-analytics|event-drains)(?:\/|$)/.test(path)?'automation':/^\/api\/(threats|whitelist)(?:\/|$)/.test(path)||path==='/api/protection/ban'?'bans':/^\/api\/(fullconfig|config)(?:\/|$)/.test(path)||path==='/api/protection/policy'?'config':path.startsWith('/api/protection/')?'players':'config';
      if(method==='GET'&&!permissions.includes('read'))fail(403,'Read permission required.');
      if(method!=='GET'&&!ownerArea&&!permissions.includes(area))fail(403,`Permission required: ${area}`);
    }
    if(path==='/api/server'&&method==='GET')return send(res,200,getLive());
    if(path==='/api/management'&&method==='GET')return send(res,200,management.summary());
    if(path==='/api/fullconfig')return send(res,200,await fullconfig.routes(path,method,method==='GET'?undefined:await readJson(req),url,auth.user));
    if(path.startsWith('/api/logs/'))return send(res,200,await logs.routes(path,method,method==='GET'?undefined:await readJson(req),url,auth.user));
    if(/^\/api\/(?:identities|threats|whitelist|webhooks|triggers|trigger-debug|trigger-analytics|users|groups|protection|event-drains)(?:\/|$)/.test(path)){
      const body=method==='GET'?undefined:await readJson(req);
      for(const module of [management,automation,protection,drains]){const result=await module.routes(path,method,body,url,auth.user);if(result!==undefined)return send(res,200,result);}
      fail(404,'Tidak ditemukan.');
    }
    if(path==='/api/state'&&method==='GET') return send(res,200,state());
    if(path==='/api/config'&&method==='POST') {
      const value=validateConfig(await readJson(req));
      db.exec('BEGIN');
      try {db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(value));audit('config',{before:config,after:value});db.exec('COMMIT');}
      catch(error){db.exec('ROLLBACK');throw error;}
      config=value;return send(res,200,{config});
    }
    if(path==='/api/native/scan'&&method==='POST') {await readJson(req);await scanNative();audit('integrity.scan',{ok:native.ok,checked:native.checked});return send(res,200,{native});}
    if(path==='/api/audit'&&method==='GET') return send(res,200,{entries:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all().map(r=>({...r,details:JSON.parse(r.details)}))});
    if(path==='/api/events'&&method==='GET') {
      const where=[],args=[];
      for(const field of ['kind','severity']) if(url.searchParams.get(field)) {where.push(`${field}=?`);args.push(url.searchParams.get(field));}
      if(url.searchParams.has('q')) {
        const q=text(url.searchParams.get('q'),128,'q');
        where.push('(instr(lower(player_name),lower(?))>0 OR instr(lower(rule),lower(?))>0)');args.push(q,q);
      }
      if(url.searchParams.get('before')) {
        const before=Number(url.searchParams.get('before'));if(!Number.isSafeInteger(before)||before<1)fail(400,'Cursor tidak valid.');
        where.push('id<?');args.push(before);
      }
      const rows=db.prepare(`SELECT * FROM events ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id DESC LIMIT 51`).all(...args);
      return send(res,200,{events:rows.slice(0,50).map(eventRow),next:rows.length>50?rows[49].id:null});
    }
    const review=path.match(/^\/api\/events\/(\d+)\/review$/);
    if(review&&method==='POST') {
      const value=await readJson(req);if(typeof value?.reviewed!=='boolean')fail(400,'reviewed harus boolean.');
      const id=Number(review[1]);
      db.exec('BEGIN');
      try {
        const result=db.prepare('UPDATE events SET reviewed=? WHERE id=?').run(Number(value.reviewed),id);
        if(!result.changes)fail(404,'Event tidak ditemukan.');
        audit('event.review',{id,reviewed:value.reviewed});db.exec('COMMIT');
      } catch(error){db.exec('ROLLBACK');throw error;}
      return send(res,200,{ok:true});
    }
    fail(404,'Tidak ditemukan.');
  } catch(error) {
    if(!error.status) console.error(error);
    if(!res.headersSent)send(res,error.status||500,{error:error.status?error.message:'Kesalahan internal.'});else res.end();
  }
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(port,'127.0.0.1',()=>console.log(`Axiom Guard listening on 127.0.0.1:${port}`));
setInterval(()=>{const t=Date.now();for(const [key,v]of attempts)if(v.until<t)attempts.delete(key);for(const [key,v]of sessions)if(v.expires<t)sessions.delete(key);nuiAuth.sweep();},60000).unref();
setInterval(()=>{void automation.flush().catch(error=>console.error('Webhook delivery:',error.message));},2000).unref();
setInterval(()=>{void drains.flush().catch(error=>console.error('Event drain:',error.message));},2000).unref();
if(process.env.GUARD_RESOURCE){void scanNative();setInterval(()=>void scanNative(),60000).unref();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
