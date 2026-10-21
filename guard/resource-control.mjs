import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const actions = new Set(['start','stop','restart','ensure','refresh']);
const safeName = name => typeof name === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(name);
const warning = name => name === 'axiom_guard' ? 'This interrupts AXIOM protection and its in-game dashboard. Use the external web dashboard to recover.' : /^(?:monitor|sessionmanager|mapmanager|spawnmanager|hardcap|qb-core|qbx_core|es_extended|oxmysql|ox_lib|ox_inventory)$/.test(name) ? 'Core dependency: this can interrupt connected players and dependent resources. Dependencies may need to be restarted separately.' : 'Stopping or restarting a resource can interrupt players and dependent resources.';

export function createResourceControl({db, fail, audit, now}) {
  db.exec('CREATE TABLE IF NOT EXISTS resource_commands(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,receipt TEXT NOT NULL)');
  let busy = false;
  const stamp = () => new Date(now()).toISOString();
  const save = receipt => db.prepare('INSERT INTO resource_commands VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET receipt=excluded.receipt').run(receipt.id,receipt.createdAt,JSON.stringify(receipt));
  const record = receipt => audit('resource.command',receipt);
  for(const row of db.prepare("SELECT receipt FROM resource_commands WHERE json_extract(receipt,'$.status')='pending'").all()) {
    const receipt=JSON.parse(row.receipt);
    if(receipt.status==='pending') { receipt.status='unknown';receipt.message='Dashboard restarted before native completion was observed. Inspect resource state before retrying.';receipt.completedAt=stamp();save(receipt);record(receipt); }
  }
  function authorize(user) {
    if(!user || !['owner','admin'].includes(user.groupId)) {
      audit('resource.denied',{operator:user?.name||'unknown',operatorId:user?.id??null,groupId:user?.groupId??null});
      fail(403,'Only Owner and the built-in Administrator group can administer resources.');
    }
  }
  async function connection() {
    let selected;
    try{selected=JSON.parse(await readFile(process.env.GUARD_TXADMIN_TRANSPORT||'C:/ProgramData/AxiomGuard/control/txadmin-transport.json','utf8'));}
    catch{fail(503,'Server-only txAdmin transport file is unavailable. Check the AxiomGuardControl task.');}
    if(typeof selected?.token!=='string'||!/^[A-Za-z0-9_-]{16,256}$/.test(selected.token)||!Number.isInteger(selected.port)||selected.port<1||selected.port>65535)fail(503,'Invalid server-only txAdmin transport.');
    let identifier;
    try {
      if(process.env.GUARD_TXADMIN_IDENTITY) {
        identifier=JSON.parse(await readFile(process.env.GUARD_TXADMIN_IDENTITY,'utf8')).identifier;
      } else {
        const admins=JSON.parse(await readFile(process.env.GUARD_TXADMIN_ADMINS || 'C:/Users/Administrator/Desktop/ax/txdata/admins.json','utf8'));
        identifier=admins.find(admin=>admin.master)?.providers?.citizenfx?.identifier;
      }
    } catch { fail(503,'Cannot read the server-only txAdmin identity file.'); }
    if(typeof identifier!=='string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(identifier)) fail(503,'txAdmin master CitizenFX identifier is unavailable.');
    const headers={'x-txadmin-token':selected.token,'x-txadmin-identifiers':identifier};
    async function request(path,body,json=false,timeout=5000) {
      let response;
      try {
        response=await fetch(`http://127.0.0.1:${selected.port}${path}`,{method:body===undefined?'GET':'POST',headers:body===undefined?headers:{...headers,'content-type':json?'application/json':'text/plain;charset=UTF-8'},body:body===undefined?undefined:json?JSON.stringify(body):body,redirect:'error',signal:AbortSignal.timeout(timeout)});
      } catch { throw new Error('Local txAdmin transport unavailable; execution may be uncertain. Inspect state before retrying.'); }
      if(!response.ok) throw new Error(`Local txAdmin rejected the request (${response.status}).`);
      const value=await response.text();
      if(value.length>4*1024*1024) throw new Error('Local txAdmin response exceeded the safety limit.');
      return value;
    }
    let sid, mutex=null, connected=false, closed=false, initialConsole=false, output='', pollTask;
    const base='/socket.io/?EIO=4&transport=polling&rooms=playerlist,liveconsole';
    const post=value=>request(`${base}&sid=${encodeURIComponent(sid)}`,value);
    async function packets(raw) {
      for(const packet of raw.split('\x1e')) {
        if(packet==='2') { await post('3');continue; }
        if(packet==='1'||packet.startsWith('44')) throw new Error('Local txAdmin observation session closed.');
        if(packet.startsWith('40')) connected=true;
        if(!packet.startsWith('42')) continue;
        const event=JSON.parse(packet.slice(2));
        if(event[0]==='playerlist') for(const item of event[1]||[]) if(item.type==='fullPlayerlist') mutex=item.mutex;
        if(event[0]==='consoleData') {
          if(initialConsole) output=(output+String(event[1]??'')).slice(-256*1024);
          initialConsole=true;
        }
      }
    }
    try {
      const opening=await request(base);
      if(!opening.startsWith('0')) throw new Error('Local txAdmin polling handshake failed.');
      sid=JSON.parse(opening.slice(1)).sid;
      if(typeof sid!=='string'||!/^[A-Za-z0-9_-]+$/.test(sid)) throw new Error('Invalid local txAdmin polling session.');
      await post('40');
      for(let i=0;i<4&&(!connected||!mutex||!initialConsole);i++) await packets(await request(`${base}&sid=${encodeURIComponent(sid)}`));
      if(!connected||typeof mutex!=='string'||!mutex||!initialConsole) throw new Error('FXServer is offline or native observation is unavailable.');
    } catch(error) { if(sid) await post('41\x1e1').catch(()=>{});throw error; }
    let observationError=null;
    const expectedSession=mutex;
    pollTask=(async()=>{
      while(!closed) {
        try { await packets(await request(`${base}&sid=${encodeURIComponent(sid)}`,undefined,false,30000)); }
        catch(error) { if(!closed) observationError=error;break; }
      }
    })();
    return {
      session:expectedSession,
      async resources() {
        if(observationError) throw observationError;
        const html=await request('/legacy/resources');
        if(mutex!==expectedSession) throw new Error('FXServer session changed during native observation. Reload resources before retrying.');
        const encoded=html.match(/const resGroupsJS\s*=\s*JSON\.parse\(atob\(`([A-Za-z0-9+/=]+)`\)\)/)?.[1];
        if(!encoded) throw new Error('Fresh native resource report unavailable. Check txAdmin authentication and FXServer monitor.');
        let groups;
        try { groups=JSON.parse(Buffer.from(encoded,'base64').toString('utf8')); } catch { throw new Error('Invalid native resource report.'); }
        if(!Array.isArray(groups)) throw new Error('Invalid native resource groups.');
        const resources=groups.flatMap(group=>Array.isArray(group.resources)?group.resources:[]);
        if(!resources.length || resources.some(resource=>typeof resource.name!=='string'||typeof resource.status!=='string')) throw new Error('Invalid native resource states.');
        return resources.map(resource=>({name:resource.name,state:resource.status,manageable:safeName(resource.name),warning:warning(resource.name)})).sort((a,b)=>a.name.localeCompare(b.name));
      },
      async command(action,target) {
        if(mutex!==expectedSession||observationError) throw new Error('FXServer session changed or observation disconnected before dispatch.');
        output='';
        const response=JSON.parse(await request('/fxserver/commands',{action:`${action}_res`,parameter:target},true));
        if(response.type==='error'||response.logout||!['warning','success'].includes(response.type)) throw new Error('txAdmin refused the resource command. Check its resource permissions and live console.');
      },
      evidence(action,target) {
        const clean=output.replace(/\{§[a-f0-9]+\}/gi,'').replace(/\x1b\[[0-9;]*m/g,'').replace(/\^[0-9]/g,'');
        if(action==='refresh') return /\[\s*resources\s*\]\s*Found\s*\d+\s+(?:new\s+)?resources?\b/i.test(clean);
        const escaped=target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        return new RegExp(`(?:^|\\n)\\[\\s*resources\\s*\\]\\s*Started resource ${escaped}(?:\\s|$)`).test(clean);
      },
      async close() { closed=true;await post('41\x1e1').catch(()=>{});await pollTask; }
    };
  }
  async function snapshot() {
    const conn=await connection();
    try { return {serverSession:conn.session,resources:await conn.resources(),observedAt:stamp(),source:'txAdmin native resource report'}; }
    finally { await conn.close(); }
  }
  async function execute(body,user) {
    if(!body || typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['action','target','serverSession','confirmed'].includes(key))) fail(400,'Unexpected resource command fields.');
    const {action,target,serverSession}=body;
    if(!actions.has(action)||typeof target!=='string'||(action==='refresh'?target!=='':!safeName(target))) fail(400,'Invalid resource action or exact resource name.');
    if(body.confirmed!==true) fail(400,'Explicit action confirmation is required.');
    if(typeof serverSession!=='string'||!serverSession||serverSession.length>160) fail(400,'A fresh server session is required.');
    if(busy) fail(409,'Another resource action is awaiting native results. Inspect its receipt first.');
    busy=true;
    let conn,receipt,dispatched=false;
    try {
      conn=await connection();
      if(conn.session!==serverSession) fail(409,'FXServer session changed. Reload resources and confirm again.');
      const resources=await conn.resources(),resource=resources.find(item=>item.name===target);
      if(action!=='refresh'&&!resource) fail(404,'Resource is not present in the fresh native resource report.');
      receipt={id:randomUUID(),operator:user.name,operatorId:user.id,groupId:user.groupId,action,target,serverSession,status:'pending',beforeState:resource?.state??null,afterState:null,createdAt:stamp(),completedAt:null,message:'Awaiting native FXServer result.'};
      save(receipt);record(receipt);
      dispatched=true;
      await conn.command(action,target);
      const observation=conn;conn=null;
      void observe(observation,receipt);
      return {command:receipt};
    } catch(error) {
      if(receipt) {receipt.status=dispatched?'unknown':'failed';receipt.message=error.message;receipt.completedAt=stamp();save(receipt);record(receipt);}
      throw error;
    } finally { if(conn) await conn.close();if(conn||!receipt||receipt.status!=='pending') busy=false; }
  }
  async function observe(conn,receipt) {
    try {
      const deadline=Date.now()+30000;
      while(Date.now()<deadline) {
        await new Promise(resolve=>setTimeout(resolve,750));
        const resources=await conn.resources();
        receipt.afterState=receipt.action==='refresh'?null:resources.find(resource=>resource.name===receipt.target)?.state??'missing';
        const stateMatches=receipt.action==='refresh'||receipt.afterState===(receipt.action==='stop'?'stopped':'started');
        const transitionRequired=receipt.action==='refresh'||receipt.action==='restart'||(receipt.action==='ensure'&&receipt.beforeState==='started');
        if(stateMatches&&(!transitionRequired||conn.evidence(receipt.action,receipt.target))) {
          receipt.status='completed';receipt.message=receipt.action==='refresh'?'Native resource refresh observed; fresh resource report received.':`Native resource state observed: ${receipt.afterState}${transitionRequired?' after native start event':''}.`;break;
        }
      }
      if(receipt.status==='pending') {receipt.status='unknown';receipt.message='Native completion was not observed before timeout. The command may have executed. Inspect current resource state and txAdmin console before retrying.';}
    } catch(error) { receipt.status='unknown';receipt.message=error.message; }
    finally {receipt.completedAt=stamp();save(receipt);record(receipt);await conn.close();busy=false;}
  }
  async function routes(path,method,body,url,user) {
    if(!/^\/api\/resources(?:\/|$)/.test(path)) return undefined;
    authorize(user);
    if(path==='/api/resources'&&method==='GET') return snapshot();
    if(path==='/api/resources/commands'&&method==='POST') return execute(body,user);
    if(path==='/api/resources/commands'&&method==='GET') return {commands:db.prepare('SELECT receipt FROM resource_commands ORDER BY created_at DESC LIMIT 100').all().map(row=>JSON.parse(row.receipt))};
    const match=path.match(/^\/api\/resources\/commands\/([a-f0-9-]{36})$/);
    if(match&&method==='GET') {const row=db.prepare('SELECT receipt FROM resource_commands WHERE id=?').get(match[1]);if(!row) fail(404,'Resource command receipt not found.');return {command:JSON.parse(row.receipt)};}
    fail(404,'Resource route not found.');
  }
  return {routes};
}
