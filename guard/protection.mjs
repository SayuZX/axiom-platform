import {randomBytes, timingSafeEqual} from 'node:crypto';

const ruleNames = {
  explosion_rate:'Explosion rate', entity_rate:'Entity creation rate', particle_rate:'Particle rate',
  projectile_rate:'Projectile rate', weapon_damage:'Damage override', weapon_blacklist:'Weapon blacklist',
  entity_blacklist:'Entity model blacklist', client_observation:'Client observations',
  heartbeat_missing:'Client heartbeat', movement_observation:'Server position observations'
};
const observed = new Set(['client_observation','heartbeat_missing','movement_observation']);
const defaults = () => ({rules:Object.fromEntries(Object.keys(ruleNames).map(id=>[id,{enabled:true,action:observed.has(id)?'monitor':'cancel'}])),weapons:[],entities:[],allowedWeapons:[],allowedEntities:[],adminBypass:false,zones:[],movementSpeed:150});
const parse = value => JSON.parse(value);
const primary = p => p?.identifiers?.find(i=>i.startsWith('license:')) || p?.identifiers?.find(i=>i.startsWith('license2:'));

export function createProtection({db,fail,audit,now,getLive,getMode,addBan,getFullConfig,runScript}) {
  db.exec(`CREATE TABLE IF NOT EXISTS pg_policy(id INTEGER PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pg_commands(id TEXT PRIMARY KEY,type TEXT NOT NULL,player_id INTEGER NOT NULL,player_name TEXT NOT NULL,player_session TEXT NOT NULL,license TEXT NOT NULL,server_session TEXT NOT NULL,key TEXT NOT NULL,preset TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL,message TEXT NOT NULL DEFAULT '',data TEXT);
    CREATE TABLE IF NOT EXISTS pg_media(id TEXT PRIMARY KEY,command_id TEXT UNIQUE NOT NULL,player_id INTEGER NOT NULL,player_name TEXT NOT NULL,created_at TEXT NOT NULL,bytes INTEGER NOT NULL,image TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pg_seen(event_key TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS pg_counts(license TEXT PRIMARY KEY,name TEXT NOT NULL,detections INTEGER NOT NULL DEFAULT 0,connections INTEGER NOT NULL DEFAULT 0,last_seen TEXT NOT NULL);`);
  const commandColumns=new Set(db.prepare('PRAGMA table_info(pg_commands)').all().map(c=>c.name));
  if(!commandColumns.has('reason'))db.exec("ALTER TABLE pg_commands ADD COLUMN reason TEXT NOT NULL DEFAULT ''");
  if(!commandColumns.has('test'))db.exec('ALTER TABLE pg_commands ADD COLUMN test INTEGER NOT NULL DEFAULT 0');
  for(const column of ['dispatched_at','completed_at'])if(!commandColumns.has(column))db.exec(`ALTER TABLE pg_commands ADD COLUMN ${column} TEXT`);
  if(!db.prepare('PRAGMA table_info(pg_media)').all().some(c=>c.name==='pinned'))db.exec('ALTER TABLE pg_media ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE TABLE IF NOT EXISTS pg_scripts(id INTEGER PRIMARY KEY,name TEXT NOT NULL,code TEXT NOT NULL,updated_at TEXT NOT NULL)');
  if(!commandColumns.has('script_code'))db.exec("ALTER TABLE pg_commands ADD COLUMN script_code TEXT NOT NULL DEFAULT ''");
  if(!commandColumns.has('script_plan'))db.exec("ALTER TABLE pg_commands ADD COLUMN script_plan TEXT NOT NULL DEFAULT ''");
  db.prepare('INSERT OR IGNORE INTO pg_policy VALUES(1,?)').run(JSON.stringify(defaults()));
  const policy=()=>{
    const p=parse(db.prepare('SELECT value FROM pg_policy WHERE id=1').get().value),full=getFullConfig?.();
    if(full){
      p.engineRules=full.serverRules;p.clientRules=full.clientRules;p.clientPolicy={};
      for(const definition of full.detectionRules){
        const configured=full.values['Detection settings']?.[definition.key];
        p.rules[definition.key]={enabled:full.values[definition.key]!==false&&configured?.enabled!==false,
          action:configured&&definition.actions.includes(configured.action)?configured.action:definition.defaultAction};
        if(full.clientRules.includes(definition.key))p.clientPolicy[definition.key]=p.rules[definition.key];
      }
    }
    return p;
  };
  const object = v => v && typeof v==='object' && !Array.isArray(v);
  function string(v,max,label) {
    if(typeof v!=='string'||!v.length||v.length>max||v.includes('\0')) fail(400,`Invalid ${label}.`);
    return v;
  }
  function admin(user) { if(!user || !['owner','admin'].includes(user.role)) fail(403,'Administrator permission required.'); }
  function validatePolicy(body) {
    if(!object(body)||!object(body.rules)) fail(400,'Complete policy required.');
    const result=defaults();
    for(const id of Object.keys(ruleNames)) {
      const r=body.rules[id];
      if(!object(r)||typeof r.enabled!=='boolean'||!['monitor','cancel','kick','ban'].includes(r.action)||observed.has(id)&&r.action!=='monitor') fail(400,`Invalid rule ${id}.`);
      result.rules[id]={enabled:r.enabled,action:r.action};
    }
    for(const key of ['weapons','entities','allowedWeapons','allowedEntities']) {
      if(!Array.isArray(body[key])||body[key].length>128) fail(400,`Invalid ${key}.`);
      result[key]=[...new Set(body[key].map(v=>{
        if(typeof v==='number'&&Number.isInteger(v)&&v>=-2147483648&&v<=4294967295) return v>>>0;
        if(typeof v==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(v)) return v.toLowerCase();
        fail(400,`${key}: use native names or 32-bit hashes.`);
      }))];
    }
    if(typeof body.adminBypass!=='boolean') fail(400,'Invalid admin bypass.');
    result.adminBypass=body.adminBypass;
    if(!Number.isFinite(body.movementSpeed)||body.movementSpeed<10||body.movementSpeed>1000) fail(400,'Movement threshold must be 10–1000 m/s.');
    result.movementSpeed=body.movementSpeed;
    if(!Array.isArray(body.zones)||body.zones.length>32) fail(400,'Maximum 32 zones.');
    result.zones=body.zones.map(z=>{
      if(!object(z)||!['x','y','z','radius'].every(k=>Number.isFinite(z[k]))||Math.max(Math.abs(z.x),Math.abs(z.y),Math.abs(z.z))>100000||z.radius<1||z.radius>10000) fail(400,'Invalid zone coordinates/radius.');
      return {name:string(z.name,64,'zone name'),x:z.x,y:z.y,z:z.z,radius:z.radius};
    });
    return result;
  }
  function expire(){db.prepare("UPDATE pg_commands SET status='expired',message='The resource did not confirm completion before the deadline.' WHERE status IN ('queued','dispatched') AND expires_at<=?").run(now());}
  function commandRow(r) {
    return {id:r.id,type:r.type,playerId:r.player_id,playerName:r.player_name,playerSession:r.player_session,serverSession:r.server_session,preset:r.preset,reason:r.reason,test:!!r.test,createdAt:r.created_at,dispatchedAt:r.dispatched_at,completedAt:r.completed_at,expiresAt:r.expires_at,status:r.status,message:r.message,data:r.data?parse(r.data):null};
  }
  const mediaRow=r=>({id:r.id,commandId:r.command_id,playerId:r.player_id,playerName:r.player_name,createdAt:r.created_at,bytes:r.bytes,pinned:!!r.pinned});
  function queueCommand(body,user,snapshot=getLive()) {
    admin(user);expire();
    if(!object(body))fail(400,'Command object required.');
    const live=snapshot,p=live.players?.find(p=>p.id===body.playerId);
    if(!live.online||!live.sessionId||!p?.sessionId||!primary(p))fail(409,'A live licensed player session is required.');
    if(body.playerSession!==p.sessionId||body.serverSession!==live.sessionId)fail(409,'Player/server session changed. Refresh the roster.');
    if(!['screenshot','preset','kick','script'].includes(body.type))fail(400,'Invalid command type.');
    if(body.type==='screenshot'&&!live.capabilities?.screenshots)fail(409,'screenshot-basic is not running.');
    if(body.type==='preset'&&(!live.capabilities?.presets||!['inspect_player','disarm_player'].includes(body.preset)))fail(400,'Supported native preset required.');
    if(body.preset==='disarm_player'&&body.confirm!==true)fail(400,'Confirm disarming this player.');
    if(body.type==='script'){
      if(user.role!=='owner')fail(403,'Only the owner can execute scripts.');
      if(!live.capabilities?.scripts||body.confirm!==true)fail(409,'Confirm execution on a script-capable resource.');
      string(body.code,16384,'script code');
    }
    let reason='',test=false;
    if(body.type==='kick'){
      if(!live.capabilities?.kick)fail(409,'Resource native-kick capability is unavailable.');
      if(body.confirm!==true)fail(400,'Explicit kick confirmation required.');
      reason=string(body.reason,256,'kick reason').trim();if(!reason||/[\r\n\x00-\x1f]/.test(reason))fail(400,'Use a nonempty single-line kick reason.');
      if(body.test!==undefined&&typeof body.test!=='boolean')fail(400,'Invalid test flag.');test=body.test===true;
    }
    if(db.prepare("SELECT count(*) n FROM pg_commands WHERE status IN ('queued','dispatched')").get().n>=2048||db.prepare("SELECT id FROM pg_commands WHERE status IN ('queued','dispatched') AND player_session=? AND type=?").get(p.sessionId,body.type))fail(409,'A command is already pending or queue is full.');
    const id=randomBytes(16).toString('hex'),key=randomBytes(32).toString('hex'),at=now();
    db.prepare('INSERT INTO pg_commands(id,type,player_id,player_name,player_session,license,server_session,key,preset,created_at,expires_at,status,reason,test) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,body.type,p.id,p.name,p.sessionId,primary(p),live.sessionId,key,body.type==='preset'?body.preset:null,at,new Date(Date.parse(at)+30000).toISOString(),'queued',reason,+test);
    if(body.type==='script')db.prepare('UPDATE pg_commands SET script_code=? WHERE id=?').run(body.code,id);
    audit('protection.command',{id,type:body.type,playerId:p.id,reason,test,preset:body.preset||null,actor:user.name});
    return {command:commandRow(db.prepare('SELECT * FROM pg_commands WHERE id=?').get(id))};
  }
  async function prepareScript(body,user){
    if(user.role!=='owner')fail(403,'Only the owner can execute scripts.');
    const live=getLive(),player=live.players.find(p=>p.id===body.playerId);
    if(body.confirm!==true||!live.online||body.serverSession!==live.sessionId||!player||body.playerSession!==player.sessionId)fail(409,'Confirm execution against a current player snapshot.');
    const code=string(body.code,16384,'script code');
    if(typeof runScript!=='function')fail(503,'Native Lua worker unavailable.');
    let plan;try{plan=await runScript(code,player);}catch(error){fail(400,error.message);}
    if(JSON.stringify(plan).length>8192)fail(400,'Script result exceeds 8 KiB.');
    return atomic('pg_script',()=>{const result=queueCommand(body,user);db.prepare('UPDATE pg_commands SET script_plan=? WHERE id=?').run(JSON.stringify(plan),result.command.id);return result;});
  }
  function atomic(name,operation){
    db.exec(`SAVEPOINT ${name}`);
    try{const result=operation();db.exec(`RELEASE ${name}`);return result;}
    catch(error){db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);throw error;}
  }
  function kickAll(body,user){
    if(user.role!=='owner')fail(403,'Only the owner can run a mass-kick test.');
    const live=getLive();
    if(!object(body)||body.confirm!==true||body.test!==true||body.serverSession!==live.sessionId||!Array.isArray(body.targets)||!body.targets.length||body.targets.length>2048)fail(400,'Confirm an explicit live roster snapshot for this test.');
    if(new Set(body.targets.map(t=>t?.playerId)).size!==body.targets.length)fail(400,'Duplicate player targets.');
    return atomic('pg_kick_all',()=>({commands:body.targets.map(t=>queueCommand({type:'kick',playerId:t?.playerId,playerSession:t?.playerSession,serverSession:body.serverSession,reason:body.reason,confirm:true,test:true},user,live).command)}));
  }
  function banPlayer(body,user){
    admin(user);
    if(!object(body)||body.confirm!==true)fail(400,'Explicit ban and disconnect confirmation required.');
    const live=getLive(),p=live.players.find(p=>p.id===body.playerId);
    if(!p||!primary(p))fail(409,'Player is no longer connected.');
    return atomic('pg_manual_ban',()=>{
      const command=queueCommand({...body,type:'kick',test:false},user,live).command;
      const uid=primary(p).split(':')[1].toLowerCase();
      const result=addBan({uid,reason:body.reason,expiresAt:body.expiresAt},user);
      return {...result,command};
    });
  }
  function matches(r,server) {
    const p=server?.players?.find(p=>p.id===r.player_id);
    return server?.sessionId===r.server_session&&p?.sessionId===r.player_session&&primary(p)===r.license;
  }
  function commands(server) {
    expire();
    const rows=db.prepare("SELECT * FROM pg_commands WHERE status IN ('queued','dispatched') ORDER BY created_at,id").all();
    const matching=[];
    for(const r of rows){if(!matches(r,server)){db.prepare("UPDATE pg_commands SET status='failed',message='Player session ended before execution.' WHERE id=? AND status='queued'").run(r.id);continue;}matching.push(r);if(matching.length===32)break;}
    for(const r of matching)db.prepare("UPDATE pg_commands SET status='dispatched',dispatched_at=? WHERE id=? AND status='queued'").run(now(),r.id);
    return matching.map(r=>({id:r.id,type:r.type,playerId:r.player_id,playerSession:r.player_session,license:r.license,serverSession:r.server_session,key:r.key,expiresAt:r.expires_at,preset:r.preset,reason:r.reason,test:!!r.test,plan:r.type==='script'?parse(r.script_plan):undefined}));
  }
  function results(items,server) {
    expire();
    if(!Array.isArray(items)||items.length>32) fail(400,'Invalid command results.');
    for(const v of items) {
      if(!object(v)||!['completed','failed'].includes(v.status)) fail(400,'Invalid command result.');
      const r=db.prepare('SELECT * FROM pg_commands WHERE id=?').get(string(v.id,64,'command id'));
      if(!r||r.status!=='dispatched')continue;
      if(v.serverSession!==r.server_session||server.sessionId!==r.server_session||v.playerSession!==r.player_session||typeof v.key!=='string'||!/^[a-f0-9]{64}$/.test(v.key)||!timingSafeEqual(Buffer.from(v.key),Buffer.from(r.key)))fail(403,'Command receipt does not match the dispatched session.');
      if(r.type==='screenshot'&&v.status==='completed') continue; // Media upload owns screenshot completion.
      const data=v.data===undefined?null:JSON.stringify(v.data);
      if(data&&data.length>8192) fail(400,'Result data too large.');
      db.prepare("UPDATE pg_commands SET status=?,message=?,data=?,completed_at=? WHERE id=? AND status='dispatched'").run(v.status,string(v.message||v.status,512,'result message'),data,now(),r.id);
      audit('protection.receipt',{id:r.id,type:r.type,status:v.status,playerId:r.player_id,playerSession:r.player_session,message:v.message});
    }
  }
  function receiveMedia(body) {
    if(!object(body)) fail(400,'Invalid media upload.');
    const r=db.prepare('SELECT * FROM pg_commands WHERE id=?').get(string(body.commandId,64,'command id'));
    const key=string(body.key,64,'media key');
    if(!r||r.type!=='screenshot'||!/^[a-f0-9]{64}$/.test(key)||!timingSafeEqual(Buffer.from(key),Buffer.from(r.key))) fail(403,'Media command authentication failed.');
    const existing=db.prepare('SELECT * FROM pg_media WHERE command_id=?').get(r.id);
    if(existing) return {accepted:true,id:existing.id};
    if(r.status!=='dispatched'||Date.parse(r.expires_at)<=Date.now()||!getLive().online||!matches(r,getLive())) fail(409,'Media session expired.');
    const image=body.image;
    if(typeof image!=='string'||image.length>8*1024*1024-1024||(image.length-23)%4!==0||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) fail(400,'JPEG data URI required; maximum request 8 MiB.');
    const bytes=Buffer.from(image.slice(23),'base64');
    if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217) fail(400,'Invalid JPEG bytes.');
    const id=randomBytes(16).toString('hex');
    db.prepare('INSERT INTO pg_media(id,command_id,player_id,player_name,created_at,bytes,image) VALUES(?,?,?,?,?,?,?)').run(id,r.id,r.player_id,r.player_name,now(),bytes.length,image);
    db.prepare("UPDATE pg_commands SET status='completed',message='Screenshot received',data=?,completed_at=? WHERE id=?").run(JSON.stringify({mediaId:id}),now(),r.id);
    return {accepted:true,id};
  }
  function ingest(server,events) {
    for(const e of events) {
      if(!['detection','connection'].includes(e.kind)) continue;
      const license=primary({identifiers:e.details?.identifiers});
      if(!license||!db.prepare('INSERT OR IGNORE INTO pg_seen VALUES(?)').run(e.key).changes) continue;
      db.prepare('INSERT INTO pg_counts VALUES(?,?,?,?,?) ON CONFLICT(license) DO UPDATE SET name=excluded.name,detections=detections+excluded.detections,connections=connections+excluded.connections,last_seen=excluded.last_seen').run(license,e.playerName,e.kind==='detection'?1:0,e.kind==='connection'?1:0,e.at);
    }
  }
  async function routes(path,method,body,url,user) {
    if(!path.startsWith('/api/protection/')) return;
    if(!user) fail(401,'Authentication required.');
    if(method!=='GET') admin(user);
    if(path==='/api/protection/kick-all'&&method==='POST')return kickAll(body,user);
    if(path==='/api/protection/ban'&&method==='POST')return banPlayer(body,user);
    if(path==='/api/protection/scripts'){
      if(user.role!=='owner')fail(403,'Only the owner can manage scripts.');
      if(method==='GET')return {scripts:db.prepare('SELECT id,name,code,updated_at AS updatedAt FROM pg_scripts ORDER BY name').all()};
      if(method==='POST'){const name=string(body?.name,80,'script name'),code=string(body?.code,16384,'script code');const r=db.prepare('INSERT INTO pg_scripts(name,code,updated_at) VALUES(?,?,?)').run(name,code,now());audit('script.save',{id:Number(r.lastInsertRowid),name,actor:user.name});return {id:Number(r.lastInsertRowid)};}
    }
    const savedScript=path.match(/^\/api\/protection\/scripts\/(\d+)(\/remove)?$/);
    if(savedScript&&method==='POST'){
      if(user.role!=='owner')fail(403,'Only the owner can manage scripts.');
      const id=Number(savedScript[1]);if(!db.prepare('SELECT id FROM pg_scripts WHERE id=?').get(id))fail(404,'Script not found');
      if(savedScript[2])db.prepare('DELETE FROM pg_scripts WHERE id=?').run(id);
      else db.prepare('UPDATE pg_scripts SET name=?,code=?,updated_at=? WHERE id=?').run(string(body?.name,80,'script name'),string(body?.code,16384,'script code'),now(),id);
      audit(savedScript[2]?'script.remove':'script.update',{id,actor:user.name});return {ok:true};
    }
    if(path==='/api/protection/policy') {
      if(method==='GET') return {policy:policy(),ruleNames,mode:getMode(),adminAce:'axiom_guard.bypass'};
      if(method==='POST') {
        const value=validatePolicy(body);
        db.prepare('UPDATE pg_policy SET value=? WHERE id=1').run(JSON.stringify(value));
        audit('protection.policy',{actor:user.name,policy:value});
        return {policy:value};
      }
    }
    if(path==='/api/protection/overview'&&method==='GET') {
      const live=getLive();
      return {server:live,policy:policy(),ruleNames,mode:getMode(),presets:[{id:'inspect_player',label:'Inspect native player state',destructive:false},{id:'disarm_player',label:'Remove all player weapons',destructive:true}],media:db.prepare('SELECT count(*) count,coalesce(sum(bytes),0) bytes FROM pg_media').get()};
    }
    if(path==='/api/protection/commands') {
      if(method==='POST')return body?.type==='script'?prepareScript(body,user):queueCommand(body||{},user);
      if(method==='GET') { expire(); return {commands:db.prepare('SELECT * FROM pg_commands ORDER BY created_at DESC LIMIT 100').all().map(commandRow)}; }
    }
    const command=path.match(/^\/api\/protection\/commands\/([a-f0-9]{32})$/);
    if(command&&method==='GET') {
      expire(); const r=db.prepare('SELECT * FROM pg_commands WHERE id=?').get(command[1]);
      if(!r) fail(404,'Command not found.');
      return {command:commandRow(r)};
    }
    if(path==='/api/protection/media'&&method==='GET') {
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100),q=String(url.searchParams.get('q')||'').slice(0,160),retention=url.searchParams.get('retention')||'all';
      if(!Number.isSafeInteger(offset)||offset<0||![8,25,50,100].includes(limit)||!['all','permanent','deletable'].includes(retention))fail(400,'Invalid media filters.');
      const where="WHERE instr(lower(m.id||' '||m.player_name),lower(?))>0"+(retention==='all'?'':retention==='permanent'?' AND m.pinned=1':' AND m.pinned=0');
      const totals=db.prepare(`SELECT count(*) count,coalesce(sum(m.bytes),0) totalBytes FROM pg_media m ${where}`).get(q);
      const rows=db.prepare(`SELECT m.*,c.player_session FROM pg_media m JOIN pg_commands c ON c.id=m.command_id ${where} ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`).all(q,limit,offset);
      return {...totals,nextOffset:offset+rows.length<totals.count?offset+rows.length:null,media:rows.map(r=>({...mediaRow(r),playerSession:r.player_session}))};
    }
    const media=path.match(/^\/api\/protection\/media\/([a-f0-9]{32})(\/(?:remove|pin))?$/);
    if(media) {
      const r=db.prepare('SELECT * FROM pg_media WHERE id=?').get(media[1]);
      if(!r) fail(404,'Screenshot not found.');
      if(method==='POST'&&media[2]==='/pin'){if(typeof body?.pinned!=='boolean')fail(400,'pinned must be boolean');db.prepare('UPDATE pg_media SET pinned=? WHERE id=?').run(+body.pinned,r.id);audit('protection.media.pin',{id:r.id,pinned:body.pinned,actor:user.name});return {pinned:body.pinned};}
      if(method==='GET'&&!media[2]) return {...mediaRow(r),image:r.image};
      if(method==='POST'&&media[2]) {
        if(r.pinned)fail(409,'Unpin permanent evidence before deleting.');
        db.prepare('DELETE FROM pg_media WHERE id=?').run(r.id);
        audit('protection.media.remove',{id:r.id,actor:user.name}); return {removed:true};
      }
    }
    if(path==='/api/protection/map'&&method==='GET') {
      const s=getLive();
      return {online:s.online,lastSeen:s.lastSeen,players:s.online?s.players.map(p=>({id:p.id,name:p.name,position:p.position||null})):[]};
    }
    if(path==='/api/protection/leaderboard'&&method==='GET') return {scope:'Local observed events; counts are not a cheat score.',players:db.prepare('SELECT license,name,detections,connections,last_seen AS lastSeen FROM pg_counts ORDER BY detections DESC,connections DESC LIMIT 100').all()};
    fail(404,'Protection route not found.');
  }
  return {policy,commands,results,ingest,receiveMedia,routes};
}
