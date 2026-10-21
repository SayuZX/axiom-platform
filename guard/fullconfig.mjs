import {readFileSync} from 'node:fs';
import {isIP,BlockList} from 'node:net';
const catalog=JSON.parse(readFileSync(new URL('./public/fullconfig-schema.json',import.meta.url),'utf8'));
const fields=new Map(catalog.tabs.flatMap(t=>t.fields.map(f=>[f.key,f])));
const serverFields=new Set(['Entity ratelimit','Explosion ratelimit','Entity list (blacklist/whitelist)','Explosion list (blacklist/whitelist)','Block explosion modifiers','Blacklisted weapons','Anti bad damage','Anti give weapon','Anti remove weapon','Anti taze','Block remote particles','Max particle scale','Entity create max distance','Minimum play time for entity spawning (minutes)','EP: Blacklisted events','EP: Block bad events','Entity Firewall (BETA)','Required identifier types','Discord account min age (days)','Anti duplicate licenses']);
const sampledRules=['Anti entity attach','Anti remote entity attach','Anti armed peds','Entity Protection','Player ped list (blacklist/whitelist)','Anti super jump (server-sided)','Money gain limit','Anti open inventory','Event AI'];
for(const name of ['Max player kill distance','Anti weapon spawn','Anti client vehicle spawner',...sampledRules])serverFields.add(name);
const clientCancel=new Set(['Anti god mode','Anti god mode V2','Anti god mode V3','Player max health','Player max armour','Anti invisible','Anti spectate','Anti ragdoll','Anti no headshot','Anti vision modifiers','Max voice proximity','Anti freecam V3','Anti freecam V5','Anti noclip','Anti fly','Anti super jump','Player max run speed (in km/h)','Anti teleport to waypoint','Blacklisted weapons','Client max ammo','Anti infinite ammo','Max weapon damage modifier','Anti weapon damage modification']);
const clientRules=new Set([...clientCancel,'Aimbot detection','Aimbot detection V2','Anti SilentAim','Anti SilentAim V2','Anti freecam','Anti freecam V2','Anti hitbox modification','Anti plate swap','Anti local vehicle spawner','Anti vehicle throwing','Anti give weapon','Anti remove weapon','Anti weapon spawn','Anti client weapon spoofing','Anti client weapon spoofing V2','Blacklisted commands','Blacklisted textures','Menu detection strings']);
const sampledNoCancel=new Set(['Player ped list (blacklist/whitelist)','Anti super jump (server-sided)','Event AI']);
const admissionRules=new Set(['Required identifier types','Discord account min age (days)','Anti duplicate licenses','Required TrustScore','Enable IP bans','Anti VPN']);
for(const key of admissionRules)serverFields.add(key);
serverFields.delete('EP: Blacklisted events');
serverFields.add('Server weapon authorization');serverFields.add('Server vehicle request guard');
for(const f of fields.values()){
 if(f.key==='Anti open inventory'){f.unavailable=null;f.description='Standalone server integration: AuthorizeInventory then GuardInventory before inventory access. No framework dependency; the inventory resource must call the guard.';}
 if(['Money gain limit','Player money tracking'].includes(f.key))f.description='Server-owned balances: per-operation limit and rolling committed positive-gain budget; TrackBalances after commit, GuardBalances before changes. No client money state is trusted.';
 if(f.key==='Max weapon damage modifier')f.min=0.1;
 if(f.key==='Anti VPN')f.description='Server-side proxycheck.io reputation. Optional server-only axiom_guard_proxycheck_key. Provider failure reports unavailable without denial.';
 if(f.unavailable)continue;
 if(serverFields.has(f.key)||clientRules.has(f.key)){
  f.scope=serverFields.has(f.key)?'server':'client';
  f.actions=admissionRules.has(f.key)?['monitor','cancel']:['monitor',...((serverFields.has(f.key)&&!sampledNoCancel.has(f.key))||clientCancel.has(f.key)?['cancel']:[]),'kick','ban'];
  f.defaultAction=f.actions.includes('cancel')?'cancel':'monitor';
 }
}
export function createFullConfig({db,fail,audit,now,getBase,setBase}){
 db.exec('CREATE TABLE IF NOT EXISTS full_config(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,values_json TEXT NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS full_addresses(uid TEXT NOT NULL,address TEXT NOT NULL,last_seen TEXT NOT NULL,PRIMARY KEY(uid,address))');
 const initial=Object.fromEntries([...fields].map(([k,f])=>[k,f.default]));
 const base=getBase();initial['Entity ratelimit']=base.entityLimit;initial['Explosion ratelimit']=base.explosionLimit;
 db.prepare('INSERT OR IGNORE INTO full_config VALUES(1,1,?)').run(JSON.stringify(initial));
 function snapshot(){
  const row=db.prepare('SELECT * FROM full_config WHERE id=1').get(),values={...initial,...JSON.parse(row.values_json)},clientValues={};
  for(const tab of catalog.tabs)if(['general','menu-detections','weapons','misc'].includes(tab.id))for(const f of tab.fields)if(!f.unavailable&&!f.key.startsWith('Server weapon authorization')&&!f.key.startsWith('Server vehicle request'))clientValues[f.key]=values[f.key];
  return {revision:row.revision,values,clientValues,serverRules:[...serverFields],clientRules:[...clientRules],detectionRules:[...fields.values()].filter(f=>f.actions).map(f=>({key:f.key,scope:f.scope,actions:f.actions,defaultAction:f.defaultAction}))};
 }
 function remember(players){for(const p of players){const uid=p.identifiers.find(i=>i.startsWith('license:'))?.slice(8);if(!uid)continue;for(const id of p.identifiers)if(/^ip:\d{1,3}(?:\.\d{1,3}){3}$/.test(id))db.prepare('INSERT INTO full_addresses VALUES(?,?,?) ON CONFLICT(uid,address) DO UPDATE SET last_seen=excluded.last_seen').run(uid,id.slice(3),now());}}
 const vpnCache=new Map();
 function addressAllowed(ip,items,ids,uid){
  for(const entry of items||[]){
   if(ids.includes(entry)||entry===uid||entry===ip)return true;
   if(typeof entry!=='string'||!entry.includes('/'))continue;
   const [network,bits]=entry.split('/'),version=isIP(network),prefix=Number(bits);
   if(!version||!Number.isInteger(prefix)||prefix<0||prefix>(version===4?32:128))continue;
   const list=new BlockList();list.addSubnet(network,prefix,version===4?'ipv4':'ipv6');
   if(list.check(ip,isIP(ip)===4?'ipv4':'ipv6'))return true;
  }
  return false;
 }
 async function admit(body){
  if(!body||!Array.isArray(body.identifiers)||body.identifiers.length>32||body.identifiers.some(i=>typeof i!=='string'||i.length>160))fail(400,'Invalid connection identifiers');
  const v=snapshot().values,ids=body.identifiers,findings=[];
  const uid=ids.find(i=>i.startsWith('license:'))?.slice(8)||'';
  const exempt=key=>Array.isArray(v[key])&&v[key].some(i=>ids.includes(i)||i===uid);
  for(const type of v['Required identifier types']||[])if(!ids.some(i=>i.startsWith(String(type)+':')))findings.push({rule:'Required identifier types',reason:'Missing required identifier: '+type});
  const discord=ids.find(i=>/^discord:\d+$/.test(i));
  if(discord&&v['Discord account min age (days)']>0&&!exempt('Account age whitelist')){
   const created=Number(BigInt(discord.slice(8))>>22n)+1420070400000,days=(Date.parse(now())-created)/86400000;
   if(days<v['Discord account min age (days)'])findings.push({rule:'Discord account min age (days)',reason:'Discord account age below configured minimum',days});
  }
  const bans=uid?db.prepare('SELECT count(*) n FROM mg_bans WHERE uid=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)').get(uid,now()).n:0;
  const detections=uid?db.prepare("SELECT count(*) n FROM mg_events WHERE uid=? AND kind='detection' AND severity='high' AND at>=?").get(uid,new Date(Date.parse(now())-30*86400000).toISOString()).n:0;
  const score=Math.max(0,100-bans*60-Math.min(40,detections*5));
  const required={Off:0,Orange:20,Yellow:40,Lime:60,Green:80}[v['Required TrustScore']]||0;
  if(score<required&&!exempt('TrustScore whitelist'))findings.push({rule:'Required TrustScore',reason:v['TrustScore rejection message']||'Local AXIOM history score below threshold',score});
  const ip=ids.find(i=>/^ip:\d{1,3}(?:\.\d{1,3}){3}$/.test(i))?.slice(3);
  if(ip&&v['Enable IP bans']!=='Disabled'&&!addressAllowed(ip,v['IP ban whitelist'],ids,uid)){
   const segments=v['Enable IP bans']==='Yes, exact IP'?4:v['Enable IP bans']==='Yes, /24 subnet'?3:2;
   const key=ip.split('.').slice(0,segments).join('.');
   const age=Number(v['IP ban expiration (days)'])||0;
   const rows=db.prepare('SELECT a.address,b.id,b.created_at FROM full_addresses a JOIN mg_bans b ON b.uid=a.uid WHERE b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at>?)').all(now());
   if(rows.some(r=>r.address.split('.').slice(0,segments).join('.')===key&&(!age||Date.parse(now())-Date.parse(r.created_at)<age*86400000)))findings.push({rule:'Enable IP bans',reason:'Connection matches an active local IP ban',scope:segments===4?'exact':segments===3?'/24':'/16'});
  }
  if(ip&&isIP(ip)&&v['Anti VPN']&&!addressAllowed(ip,v['Anti VPN whitelist'],ids,uid)){
   let verdict=vpnCache.get(ip);
   if(!verdict||verdict.until<Date.now()){
    try{
     const endpoint=new URL('https://proxycheck.io/v3/'+encodeURIComponent(ip));endpoint.searchParams.set('tag','0');endpoint.searchParams.set('short','1');
     if(process.env.GUARD_PROXYCHECK_KEY)endpoint.searchParams.set('key',process.env.GUARD_PROXYCHECK_KEY);
     const response=await fetch(endpoint,{redirect:'error',signal:AbortSignal.timeout(4000)});if(!response.ok)throw new Error('VPN provider HTTP '+response.status);
     const result=await response.json(),d=result.detections||result[ip]?.detections;if(!d||typeof d.vpn!=='boolean')throw new Error('VPN provider schema');
     verdict={blocked:d.vpn||d.proxy||d.tor,until:Date.now()+600000};if(vpnCache.size>=4096)vpnCache.delete(vpnCache.keys().next().value);vpnCache.set(ip,verdict);
    }catch{findings.push({rule:'Anti VPN',reason:'VPN reputation unavailable; connection is not denied for this check',observeOnly:true});}
   }
   if(verdict?.blocked)findings.push({rule:'Anti VPN',reason:'VPN/proxy/Tor connection detected by proxycheck.io'});
  }
  const applicable=findings.filter(f=>v['Detection settings']?.[f.rule]?.enabled!==false);
  for(const f of applicable)if(v['Detection settings']?.[f.rule]?.action==='monitor')f.observeOnly=true;
  const denied=applicable.find(f=>!f.observeOnly);
  return {allowed:getBase().mode!=='protect'||!denied,reason:denied?.reason,findings:applicable,score,scope:'local observed ban/detection history'};
 }
 function validate(key,v){
  const f=fields.get(key);if(!f)fail(400,'Unknown control: '+key);
  if(['QBCore resource','ESX resource','Qbox resource','Inventory resource'].includes(key)&&(typeof v!=='string'||!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(v)))fail(400,'Invalid framework resource name');
  if(f.type==='boolean'&&typeof v!=='boolean')fail(400,key+': boolean required');
  if(f.type==='number'&&(!Number.isFinite(v)||v<f.min||v>f.max))fail(400,key+': number out of range');
  if(f.type==='select'&&!f.options.includes(v))fail(400,key+': invalid option');
  if(f.type==='text'&&(typeof v!=='string'||v.length>2048||v.includes('\0')))fail(400,key+': invalid text');
  if(f.type==='array'&&(!Array.isArray(v)||v.length>256||v.some(i=>!['string','number'].includes(typeof i)||String(i).length>128||String(i).includes('\0'))))fail(400,key+': maximum 256 entries of 128 characters');
  if(f.type==='object')validateObject(key,v);
  return v;
 }
 function validateObject(key,v){
  if(key==='Detection settings'){
   if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>128)fail(400,'Invalid detection settings');
   for(const [name,r]of Object.entries(v)){
    const field=fields.get(name);
    if(!field?.actions||!r||typeof r!=='object'||!field.actions.includes(r.action)||typeof r.enabled!=='boolean')fail(400,'Invalid detection action: '+name);
   }
  }else if(key==='Detection whitelisting zones'){
   if(!Array.isArray(v)||v.length>32)fail(400,'Maximum 32 zones');
   for(const z of v)if(!z||typeof z.name!=='string'||z.name.length>64||!['x','y','z','radius'].every(k=>Number.isFinite(z[k]))||z.radius<1||z.radius>10000)fail(400,'Invalid zone');
  }else if(key==='Entity Firewall (BETA)'){
   if(!Array.isArray(v)||v.length>256||v.some(r=>!r||typeof r.resource!=='string'||!/^[\w.\-\[\]]{1,128}$/.test(r.resource)||!['observe','block'].includes(r.mode)))fail(400,'Invalid resource firewall list');
  }else if(!Array.isArray(v))fail(400,'Invalid object configuration');
 }
 async function routes(path,method,body,url,user){
  if(path!=='/api/fullconfig')return;
  if(!user)fail(401,'Sign in required');
  if(method==='GET')return {...snapshot(),catalog,mode:getBase().mode};
  if(method!=='POST')fail(405,'Use GET or POST');
  if(!['owner','admin'].includes(user.role))fail(403,'Administrator permission required');
  const current=snapshot();
  if(!body||body.revision!==current.revision)fail(409,'Configuration changed. Reload before saving.');
  if(!body.changes||typeof body.changes!=='object'||Array.isArray(body.changes)||Object.keys(body.changes).length>128)fail(400,'Changes object required');
  for(const [k,v]of Object.entries(body.changes)){
   const f=fields.get(k);if(f?.unavailable)fail(409,f.unavailable);
   current.values[k]=validate(k,v);
  }
  const mode=body.mode??getBase().mode;if(!['monitor','protect'].includes(mode))fail(400,'Invalid mode');
  if(mode==='protect'&&body.confirmProtect!==true)fail(400,'Confirm protect-mode changes');
  db.exec('SAVEPOINT full_save');
  try{
   db.prepare('UPDATE full_config SET revision=revision+1,values_json=? WHERE id=1').run(JSON.stringify(current.values));
   setBase({...getBase(),mode,entityLimit:Math.max(1,Math.min(1000,Math.floor(current.values['Entity ratelimit']))),explosionLimit:Math.max(1,Math.min(1000,Math.floor(current.values['Explosion ratelimit'])))});
   audit('fullconfig.save',{actor:user.name,keys:Object.keys(body.changes),mode});db.exec('RELEASE full_save');
  }catch(e){db.exec('ROLLBACK TO full_save; RELEASE full_save');throw e;}
  return {...snapshot(),mode};
 }
 return {snapshot,routes,catalog,remember,admit};
}
