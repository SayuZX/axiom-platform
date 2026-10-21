import { createHash } from 'node:crypto';

export function createManagement({db, fail, text, audit, now, getLive, getMode}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mg_identities(uid TEXT PRIMARY KEY,name TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mg_identifiers(uid TEXT NOT NULL,identifier TEXT NOT NULL,PRIMARY KEY(uid,identifier));
    CREATE INDEX IF NOT EXISTS mg_identifier_lookup ON mg_identifiers(identifier);
    CREATE TABLE IF NOT EXISTS mg_events(event_key TEXT PRIMARY KEY,uid TEXT,at TEXT NOT NULL,kind TEXT NOT NULL,player_id INTEGER,name TEXT NOT NULL,rule TEXT NOT NULL,severity TEXT NOT NULL,details TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS mg_events_identity ON mg_events(uid,at);
    CREATE TABLE IF NOT EXISTS mg_sessions(id INTEGER PRIMARY KEY,uid TEXT NOT NULL,player_id INTEGER NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,ended_at TEXT);
    CREATE INDEX IF NOT EXISTS mg_sessions_open ON mg_sessions(ended_at,player_id);
    CREATE TABLE IF NOT EXISTS mg_bans(id INTEGER PRIMARY KEY,uid TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT,revoked_at TEXT,actor TEXT NOT NULL,evidence TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mg_whitelist(id INTEGER PRIMARY KEY,uid TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT,removed_at TEXT,actor TEXT NOT NULL);
  `);
  db.exec('CREATE TABLE IF NOT EXISTS mg_lua_bans(lua_id TEXT PRIMARY KEY,ban_id INTEGER UNIQUE NOT NULL)');
  const strong = values => [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value.length <= 160 && /^(?:(?:license2?|steam):[a-fA-F0-9]+|(?:fivem|discord|xbl|live):\d+)$/.test(value)).map(value => value.toLowerCase()))].sort();
  const identifiers = uid => db.prepare('SELECT identifier FROM mg_identifiers WHERE uid=? ORDER BY identifier').all(uid).map(row => row.identifier);
  const graphSQL = `WITH RECURSIVE linked(uid) AS (SELECT ? UNION SELECT b.uid FROM linked l JOIN mg_identifiers a ON a.uid=l.uid JOIN mg_identifiers b ON b.identifier=a.identifier)`;
  const graph = uid => db.prepare(`${graphSQL} SELECT uid FROM linked ORDER BY uid`).all(uid).map(row => row.uid);
  const connectedIdentifiers = uid => db.prepare(`${graphSQL} SELECT DISTINCT identifier FROM mg_identifiers WHERE uid IN (SELECT uid FROM linked) ORDER BY identifier`).all(uid).map(row => row.identifier);
  const stamp = () => new Date(now()).toISOString();
  db.exec('CREATE TABLE IF NOT EXISTS mg_names(uid TEXT NOT NULL,name TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,PRIMARY KEY(uid,name)); CREATE TABLE IF NOT EXISTS mg_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  function remember(name, values, at) {
    const ids = strong(values), primary = ids.find(id => id.startsWith('license:')) || ids.find(id => id.startsWith('license2:'));
    if (!primary) return null;
    const uid = primary.slice(primary.indexOf(':') + 1);
    db.prepare(`INSERT INTO mg_identities VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET name=CASE WHEN excluded.last_seen>=last_seen THEN excluded.name ELSE name END,first_seen=min(first_seen,excluded.first_seen),last_seen=max(last_seen,excluded.last_seen)`).run(uid,name,at,at);
    for (const id of ids) db.prepare('INSERT OR IGNORE INTO mg_identifiers VALUES(?,?)').run(uid,id);
    db.prepare(`INSERT INTO mg_names VALUES(?,?,?,?) ON CONFLICT(uid,name) DO UPDATE SET first_seen=min(first_seen,excluded.first_seen),last_seen=max(last_seen,excluded.last_seen)`).run(uid,name,at,at);
    return uid;
  }
  function ingest(server, events) {
    const at = stamp();
    for (const e of events) {
      const existing = db.prepare('SELECT uid FROM mg_events WHERE event_key=?').get(e.key);
      if (existing) { e.details.uid = existing.uid; continue; }
      const uid = remember(e.playerName,e.details.identifiers,e.at);
      e.details.uid = uid;
      db.prepare('INSERT INTO mg_events VALUES(?,?,?,?,?,?,?,?,?)').run(e.key,uid,e.at,e.kind,e.playerId,e.playerName,e.rule,e.severity,JSON.stringify(e.details));
      if (uid && e.kind==='connection') db.prepare('UPDATE mg_sessions SET ended_at=last_seen WHERE uid=? AND player_id=? AND ended_at IS NULL AND first_seen<?').run(uid,e.playerId,e.at);
      if (uid && e.kind==='disconnection') db.prepare('UPDATE mg_sessions SET ended_at=? WHERE uid=? AND player_id=? AND ended_at IS NULL AND first_seen<=?').run(e.at,uid,e.playerId,e.at);
    }
    for(const ban of server.luaBans||[]){
      const uid=remember(ban.name||'',ban.identifiers,ban.createdAt);
      if(!uid)continue;
      let mapped=db.prepare('SELECT ban_id FROM mg_lua_bans WHERE lua_id=?').get(ban.id);
      if(!mapped){
        const result=db.prepare('INSERT INTO mg_bans(uid,reason,created_at,expires_at,revoked_at,actor,evidence) VALUES(?,?,?,?,?,?,?)').run(uid,ban.reason,ban.createdAt,ban.expiresAt||null,ban.revokedAt||null,'AXIOM Lua backend',JSON.stringify({source:'Lua durable ban',luaId:ban.id,identifiers:strong(ban.identifiers),evidence:ban.evidence||{}}));
        db.prepare('INSERT INTO mg_lua_bans VALUES(?,?)').run(ban.id,Number(result.lastInsertRowid));
      }else if(ban.revokedAt)db.prepare('UPDATE mg_bans SET revoked_at=coalesce(revoked_at,?) WHERE id=?').run(ban.revokedAt,mapped.ban_id);
    }
    const previous = db.prepare("SELECT value FROM mg_meta WHERE key='uptime'").get();
    if (previous && Number(previous.value) > server.uptime) db.prepare('UPDATE mg_sessions SET ended_at=last_seen WHERE ended_at IS NULL').run();
    db.prepare("INSERT INTO mg_meta VALUES('uptime',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(server.uptime));
    const roster = new Map();
    for (const player of server.players) {
      const uid = remember(player.name,player.identifiers,at);
      if (uid) roster.set(player.id,uid);
    }
    const open = db.prepare('SELECT * FROM mg_sessions WHERE ended_at IS NULL').all();
    for (const session of open) {
      if (roster.get(session.player_id) !== session.uid || Date.parse(at)-Date.parse(session.last_seen)>30000) {
        db.prepare('UPDATE mg_sessions SET ended_at=last_seen WHERE id=?').run(session.id);
      } else {
        db.prepare('UPDATE mg_sessions SET last_seen=? WHERE id=?').run(at,session.id);
        roster.delete(session.player_id);
      }
    }
    for (const [id,uid] of roster) db.prepare('INSERT INTO mg_sessions(uid,player_id,first_seen,last_seen) VALUES(?,?,?,?)').run(uid,id,at,at);
  }
  function identity(uid) {
    const row = db.prepare('SELECT * FROM mg_identities WHERE uid=?').get(uid);
    if (!row) fail(404,'Local identity not found.');
    return {uid:row.uid,name:row.name,firstSeen:row.first_seen,lastSeen:row.last_seen,identifiers:identifiers(uid),connections:db.prepare("SELECT count(*) n FROM mg_events WHERE uid=? AND kind='connection'").get(uid).n};
  }
  const active = (expiry,removed) => !removed && (!expiry || expiry>stamp());
  const banRow = row => ({id:row.id,uid:row.uid,name:identity(row.uid).name,reason:row.reason,createdAt:row.created_at,expiresAt:row.expires_at,revokedAt:row.revoked_at,status:row.revoked_at?'revoked':active(row.expires_at,null)?'active':'expired',actor:row.actor,evidence:JSON.parse(row.evidence)});
  const entryRow = row => ({id:row.id,uid:row.uid,name:identity(row.uid).name,reason:row.reason,createdAt:row.created_at,expiresAt:row.expires_at,removedAt:row.removed_at,active:active(row.expires_at,row.removed_at),actor:row.actor});
  const requireAdmin = user => { if (!user || !['owner','admin'].includes(user.role)) fail(403,'Administrator access required.'); };
  function payload(body, allowed) {
    if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail(400,'Unexpected management fields.');
    return body;
  }
  function expires(value) {
    if (value===null || value===undefined || value==='') return null;
    if (typeof value!=='string' || !Number.isFinite(Date.parse(value)) || Date.parse(value)<=Date.parse(stamp())) fail(400,'Expiry must be a future date.');
    return new Date(value).toISOString();
  }
  function target(body) {
    const uid = text(body.uid,160,'UID').trim().toLowerCase(), reason = text(body.reason,1000,'Reason').trim();
    identity(uid);
    if (!reason) fail(400,'A reason is required.');
    return {uid,reason,expiresAt:expires(body.expiresAt)};
  }
  function addBan(body,user,allowExisting=false) {
    requireAdmin(user);
    const {uid,reason,expiresAt}=target(body),at=stamp();
    const existing=db.prepare('SELECT * FROM mg_bans WHERE uid=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)').get(uid,at);
    if(existing){if(allowExisting)return {threat:banRow(existing),mode:getMode()};fail(409,'This identity already has an active local ban.');}
    const ids=connectedIdentifiers(uid);
    if(!ids.length)fail(400,'No stored native identifiers for this identity.');
    const detections=db.prepare(`${graphSQL} SELECT event_key,at,rule,severity,details FROM mg_events WHERE kind='detection' AND uid IN (SELECT uid FROM linked) ORDER BY at DESC LIMIT 10`).all(uid);
    const evidence={source:'Local server metadata',identifierHash:createHash('sha256').update(ids.join('\n')).digest('hex'),identifiers:ids,detections:detections.map(row=>({key:row.event_key,at:row.at,rule:row.rule,severity:row.severity,details:JSON.parse(row.details)}))};
    const result=db.prepare('INSERT INTO mg_bans(uid,reason,created_at,expires_at,actor,evidence) VALUES(?,?,?,?,?,?)').run(uid,reason,at,expiresAt,user.name,JSON.stringify(evidence));
    audit('local-ban.created',{id:Number(result.lastInsertRowid),uid,reason,expiresAt,actor:user.name});
    return {threat:banRow(db.prepare('SELECT * FROM mg_bans WHERE id=?').get(result.lastInsertRowid)),mode:getMode()};
  }
  function policy() {
    const at = stamp();
    const bans = db.prepare('SELECT * FROM mg_bans WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) AND id NOT IN (SELECT ban_id FROM mg_lua_bans)').all(at).map(row => ({id:row.id,uid:row.uid,reason:row.reason,createdAt:row.created_at,expiresAt:row.expires_at,identifiers:connectedIdentifiers(row.uid)}));
    const bypass = new Map();
    for (const row of db.prepare('SELECT * FROM mg_whitelist WHERE removed_at IS NULL AND (expires_at IS NULL OR expires_at>?)').all(at)) {
      for (const uid of graph(row.uid)) {
        const prior = bypass.get(uid);
        if (!bypass.has(uid) || (prior!==null && (row.expires_at===null || row.expires_at>prior))) bypass.set(uid,row.expires_at);
      }
    }
    return {bans,whitelist:[...bypass].map(([uid,expiresAt]) => ({uid,expiresAt})),luaRevocations:db.prepare('SELECT m.lua_id FROM mg_lua_bans m JOIN mg_bans b ON b.id=m.ban_id WHERE b.revoked_at IS NOT NULL').all().map(r=>r.lua_id)};
  }
  function summary() {
    const since = new Date(Date.parse(stamp())-86400000).toISOString();
    const retention = db.prepare('SELECT round(avg((julianday(last_seen)-julianday(first_seen))*1440),1) value FROM mg_sessions WHERE ended_at IS NOT NULL').get().value;
    return {uniquePlayers:db.prepare('SELECT count(*) n FROM mg_identities').get().n,activeBans:db.prepare('SELECT count(*) n FROM mg_bans WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)').get(stamp()).n,retention,disconnectReasons:db.prepare("SELECT coalesce(nullif(json_extract(details,'$.reason'),''),'Not reported') reason,count(*) count FROM mg_events WHERE kind='disconnection' AND at>=? GROUP BY reason ORDER BY count DESC LIMIT 20").all(since)};
  }
  function paging(url) {
    const page = Number(url.searchParams.get('page') || 1);
    if (!Number.isSafeInteger(page) || page<1 || page>1000000) fail(400,'Invalid page.');
    const limit=Number(url.searchParams.get('limit')||25),sort=url.searchParams.get('sort')||'created';
    if(![8,25,50,100].includes(limit)||!['created','name','lastSeen'].includes(sort))fail(400,'Invalid page size or sorting.');
    return {page,limit,sort,offset:(page-1)*limit,q:text(url.searchParams.get('q')||'',160,'Search').trim().toLowerCase()};
  }
  async function routes(path,method,body,url,user) {
    if (!/^\/api\/(management|identities|threats|whitelist)(\/|$)/.test(path)) return undefined;
    if (!user) fail(401,'Sign in required.');
    if (method==='GET' && path==='/api/management') return summary();
    if (method==='GET' && path==='/api/identities') {
      const {page,limit,offset,q,sort}=paging(url);
      const sql = `WITH RECURSIVE found(uid) AS (
        SELECT uid FROM mg_identities WHERE instr(lower(uid),?)>0
        UNION SELECT uid FROM mg_names WHERE instr(lower(name),?)>0
        UNION SELECT uid FROM mg_identifiers WHERE instr(identifier,?)>0
        UNION SELECT b.uid FROM found f JOIN mg_identifiers a ON a.uid=f.uid JOIN mg_identifiers b ON b.identifier=a.identifier)`;
      const order=sort==='name'?'i.name COLLATE NOCASE ASC':sort==='created'?'i.first_seen DESC':'i.last_seen DESC';
      const rows=db.prepare(`${sql} SELECT i.uid FROM mg_identities i JOIN found f ON f.uid=i.uid ORDER BY ${order},i.uid LIMIT ? OFFSET ?`).all(q,q,q,limit,offset);
      return {identities:rows.map(row => identity(row.uid)),total:db.prepare(`${sql} SELECT count(*) n FROM found`).get(q,q,q).n,page,limit,scope:'local'};
    }
    const detail = path.match(/^\/api\/identities\/([^/]+)$/);
    if (method==='GET' && detail) {
      const uid = detail[1], current = identity(uid);
      const events = db.prepare(`${graphSQL} SELECT * FROM mg_events WHERE uid IN (SELECT uid FROM linked) ORDER BY at DESC,event_key DESC LIMIT 50`).all(uid);
      return {identity:current,aliases:graph(uid).filter(id => id!==uid).map(identity),names:db.prepare('SELECT name,first_seen firstSeen,last_seen lastSeen FROM mg_names WHERE uid=? ORDER BY last_seen DESC').all(uid),sessions:db.prepare('SELECT id,player_id playerId,first_seen firstSeen,last_seen lastSeen,ended_at endedAt FROM mg_sessions WHERE uid=? ORDER BY id DESC LIMIT 50').all(uid),events:events.map(row => ({key:row.event_key,uid:row.uid,at:row.at,kind:row.kind,playerId:row.player_id,playerName:row.name,rule:row.rule,severity:row.severity,details:JSON.parse(row.details)})),historyLimit:50,scope:'local'};
    }
    if (method==='GET' && (path==='/api/threats' || path==='/api/whitelist')) {
      const {page,limit,offset,q,sort}=paging(url),bans=path==='/api/threats';
      const table = bans?'mg_bans':'mg_whitelist';
      const where = `WHERE instr(lower(r.uid || ' ' || r.reason || ' ' || i.name),?)>0`;
      const order=sort==='name'?'i.name COLLATE NOCASE ASC':sort==='lastSeen'?'i.last_seen DESC':'r.created_at DESC';
      const rows=db.prepare(`SELECT r.* FROM ${table} r JOIN mg_identities i ON i.uid=r.uid ${where} ORDER BY ${order},r.id DESC LIMIT ? OFFSET ?`).all(q,limit,offset);
      return {[bans?'threats':'entries']:rows.map(bans?banRow:entryRow),total:db.prepare(`SELECT count(*) n FROM ${table} r JOIN mg_identities i ON i.uid=r.uid ${where}`).get(q).n,page,limit,scope:'local',mode:getMode()};
    }
    if (method!=='POST') fail(404,'Management route not found.');
    requireAdmin(user);
    if (path==='/api/threats') {
      payload(body,['uid','reason','expiresAt','confirmed']);
      if (body.confirmed!==true) fail(400,'Explicit local ban confirmation required.');
      return addBan(body,user);
    }
    if (path==='/api/whitelist') {
      payload(body,['uid','reason','expiresAt']);
      const {uid,reason,expiresAt} = target(body), at = stamp();
      if (db.prepare('SELECT 1 FROM mg_whitelist WHERE uid=? AND removed_at IS NULL AND (expires_at IS NULL OR expires_at>?)').get(uid,at)) fail(409,'An active local bypass already exists.');
      const result = db.prepare('INSERT INTO mg_whitelist(uid,reason,created_at,expires_at,actor) VALUES(?,?,?,?,?)').run(uid,reason,at,expiresAt,user.name);
      audit('local-whitelist.created',{id:Number(result.lastInsertRowid),uid,reason,expiresAt});
      return {entry:entryRow(db.prepare('SELECT * FROM mg_whitelist WHERE id=?').get(result.lastInsertRowid))};
    }
    const update = path.match(/^\/api\/whitelist\/(\d+)$/);
    if (update) {
      payload(body,['reason','expiresAt']);
      const row = db.prepare('SELECT * FROM mg_whitelist WHERE id=? AND removed_at IS NULL').get(update[1]);
      if (!row) fail(404,'Local bypass not found.');
      const {reason,expiresAt} = target({...body,uid:row.uid});
      if (db.prepare('SELECT 1 FROM mg_whitelist WHERE uid=? AND id<>? AND removed_at IS NULL AND (expires_at IS NULL OR expires_at>?)').get(row.uid,row.id,stamp())) fail(409,'Another active local bypass already exists.');
      db.prepare('UPDATE mg_whitelist SET reason=?,expires_at=? WHERE id=?').run(reason,expiresAt,row.id);
      audit('local-whitelist.updated',{id:row.id,uid:row.uid,reason,expiresAt});
      return {entry:entryRow(db.prepare('SELECT * FROM mg_whitelist WHERE id=?').get(row.id))};
    }
    const removal = path.match(/^\/api\/(threats|whitelist)\/(\d+)\/(revoke|remove)$/);
    if (removal && ((removal[1]==='threats' && removal[3]==='revoke') || (removal[1]==='whitelist' && removal[3]==='remove'))) {
      payload(body,[]);
      const bans = removal[1]==='threats', table = bans?'mg_bans':'mg_whitelist', column = bans?'revoked_at':'removed_at';
      const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(removal[2]);
      if (!row) fail(404,'Local record not found.');
      if (!row[column]) {
        db.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(stamp(),row.id);
        audit(bans?'local-ban.revoked':'local-whitelist.removed',{id:row.id,uid:row.uid});
      }
      return {ok:true};
    }
    fail(404,'Management route not found.');
  }
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='events'").get()) {
    const checkpoint = Number(db.prepare("SELECT value FROM mg_meta WHERE key='event_checkpoint'").get()?.value || 0);
    let last = checkpoint;
    db.exec('SAVEPOINT mg_history');
    try {
      for (const row of db.prepare('SELECT * FROM events WHERE id>? ORDER BY id').iterate(checkpoint)) {
        last = row.id;
        if (db.prepare('SELECT 1 FROM mg_events WHERE event_key=?').get(row.event_key)) continue;
        const details = JSON.parse(row.details), uid = remember(row.player_name,details.identifiers,row.at);
        details.uid = uid;
        db.prepare('INSERT INTO mg_events VALUES(?,?,?,?,?,?,?,?,?)').run(row.event_key,uid,row.at,row.kind,row.player_id,row.player_name,row.rule,row.severity,JSON.stringify(details));
      }
      db.prepare("INSERT INTO mg_meta VALUES('event_checkpoint',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(last));
      db.exec('RELEASE mg_history');
    } catch (error) { db.exec('ROLLBACK TO mg_history; RELEASE mg_history'); throw error; }
  }
  return {ingest,routes,policy,summary,addBan};
}
