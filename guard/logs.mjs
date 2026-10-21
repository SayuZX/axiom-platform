export function createLogs({db,fail,text,audit,now}) {
  db.exec('CREATE TABLE IF NOT EXISTS lg_bookmarks(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,filters TEXT NOT NULL,created_at TEXT NOT NULL)');
  const presets={'1h':3600000,'24h':86400000,'7d':604800000,'30d':2592000000,'90d':7776000000};
  const keys=['preset','from','to','q','filter','kind','severity','sort','direction','limit','action'];
  const clean=(value,max,label)=>text(value??'',max,label).trim();
  function integer(value,fallback,max) {
    const n=value===null?fallback:Number(value);
    if(!Number.isSafeInteger(n)||n<1||n>max)fail(400,'Invalid page or limit.');
    return n;
  }
  function date(value) {
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail(400,'Dates must be ISO timestamps with a timezone.');
    const [year,month,day]=value.slice(0,10).split('-').map(Number);
    const calendar=new Date(0);calendar.setUTCFullYear(year,month-1,day);
    if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)fail(400,'Invalid calendar date.');
    return new Date(value).toISOString();
  }
  function range(params) {
    const preset=params.get('preset')||'24h';
    if(preset==='all')return {};
    if(preset==='custom') {
      const from=params.get('from'),to=params.get('to');
      if(!from||!to)fail(400,'Custom range requires both dates.');
      const result={from:date(from),to:date(to)};
      if(result.from>result.to)fail(400,'From must not follow Until.');
      return result;
    }
    if(!Object.hasOwn(presets,preset))fail(400,'Unknown time preset.');
    const end=new Date(now());
    return {from:new Date(end.getTime()-presets[preset]).toISOString(),to:end.toISOString()};
  }
  const row=e=>({id:e.id,key:e.event_key,at:e.at,kind:e.kind,playerId:e.player_id,playerName:e.player_name,rule:e.rule,severity:e.severity,details:JSON.parse(e.details),reviewed:!!e.reviewed});
  function filters(source,clauses,args) {
    let rest=source;
    for(let count=0;rest;count++) {
      if(count>=20)fail(400,'At most 20 field filters are supported.');
      const match=/^(kind|rule|player|license|details\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,5})\s*=\s*("(?:[^"\\]|\\.)*"|[^\s"=]+)(?:\s+AND\s+|\s*$)/.exec(rest);
      if(!match)fail(400,'Use field=value joined with uppercase AND; quote values containing spaces.');
      const [,field,literal]=match;
      let value=literal;
      if(literal.startsWith('"')||/^(?:true|false|null|-?\d+(?:\.\d+)?)$/.test(literal)) {
        try{value=JSON.parse(literal);}catch{fail(400,'Invalid quoted filter value.');}
      }
      if(typeof value==='boolean')value=Number(value);
      if(field==='player') {clauses.push('(player_name IS ? OR CAST(player_id AS TEXT) IS ?)');args.push(String(value),String(value));}
      else if(field==='license') {
        clauses.push("(json_extract(details,'$.license') IS ? OR EXISTS (SELECT 1 FROM json_each(events.details,'$.identifiers') WHERE value IS ?))");args.push(value,value);
      } else if(field.startsWith('details.')) {
        clauses.push('json_extract(details,?) IS ?');args.push('$.'+field.slice(8),value);
      } else {clauses.push(`${field} IS ?`);args.push(value);}
      rest=rest.slice(match[0].length);
      if(!rest&&/\sAND\s+$/.test(match[0]))fail(400,'Missing filter after AND.');
    }
  }
  function query(params,isAudit=false) {
    const clauses=[],args=[],bounds=range(params);
    for(const [key,op] of [['from','>='],['to','<=']])if(bounds[key]){clauses.push(`at${op}?`);args.push(bounds[key]);}
    const q=clean(params.get('q'),500,'Keyword');
    if(q){clauses.push(isAudit?'(instr(lower(action),lower(?))>0 OR instr(lower(details),lower(?))>0)':'(instr(lower(player_name),lower(?))>0 OR instr(lower(rule),lower(?))>0 OR instr(lower(details),lower(?))>0 OR instr(lower(kind),lower(?))>0)');args.push(...Array(isAudit?2:4).fill(q));}
    for(const field of isAudit?['action']:['kind','severity']) {
      const value=clean(params.get(field),100,field);
      if(value){clauses.push(`${field}=?`);args.push(value);}
    }
    if(!isAudit)filters(clean(params.get('filter'),2000,'Field filter'),clauses,args);
    const sorts=isAudit?{at:'at',action:'action'}:{at:'at',kind:'kind',player:'player_name',rule:'rule',severity:'severity',source:'player_id',license:"coalesce(json_extract(details,'$.license'),(SELECT value FROM json_each(events.details,'$.identifiers') WHERE value LIKE 'license:%' LIMIT 1),'')"};
    const sort=params.get('sort')||'at',direction=params.get('direction')||'desc';
    if(!Object.hasOwn(sorts,sort)||!['asc','desc'].includes(direction))fail(400,'Invalid sort.');
    const page=integer(params.get('page'),1,1000000),limit=integer(params.get('limit'),25,100);
    if(![25,50,100].includes(limit))fail(400,'Limit must be 25, 50 or 100.');
    return {where:clauses.length?' WHERE '+clauses.join(' AND '):'',args,order:`${sorts[sort]} ${direction},id ${direction}`,page,limit,bounds};
  }
  async function routes(path,method,body,url,user) {
    if(!/^\/api\/logs(?:\/|$)/.test(path))return undefined;
    if(!user?.id)fail(401,'Sign in required.');
    if(method!=='GET'&&user.role==='viewer')fail(403,'Viewer access is read-only.');
    if(path==='/api/logs/bookmarks') {
      if(method==='GET')return {bookmarks:db.prepare('SELECT * FROM lg_bookmarks WHERE user_id=? ORDER BY name,id').all(user.id).map(b=>({id:b.id,name:b.name,filters:JSON.parse(b.filters),createdAt:b.created_at}))};
      if(method==='POST') {
        if(!body||Object.keys(body).some(k=>!['name','filters'].includes(k))||!body.filters||typeof body.filters!=='object'||Array.isArray(body.filters))fail(400,'Invalid bookmark.');
        const name=clean(body.name,80,'Bookmark name');
        if(!name||Object.keys(body.filters).some(k=>!keys.includes(k)||typeof body.filters[k]!=='string'))fail(400,'Invalid bookmark fields.');
        if(JSON.stringify(body.filters).length>5000)fail(400,'Bookmark is too large.');
        if(Object.hasOwn(body.filters,'action')&&['kind','severity','filter'].some(k=>Object.hasOwn(body.filters,k)))fail(400,'Audit and event filters cannot be mixed.');
        const params=new URLSearchParams(body.filters);query(params,body.filters.action!==undefined);
        if(db.prepare('SELECT count(*) n FROM lg_bookmarks WHERE user_id=?').get(user.id).n>=50)fail(400,'Maximum 50 saved queries per user.');
        const result=db.prepare('INSERT INTO lg_bookmarks(user_id,name,filters,created_at) VALUES(?,?,?,?)').run(user.id,name,JSON.stringify(body.filters),new Date(now()).toISOString());
        audit('logs.bookmark.save',{id:Number(result.lastInsertRowid),actor:user.id});
        return {id:Number(result.lastInsertRowid)};
      }
    }
    const removed=path.match(/^\/api\/logs\/bookmarks\/(\d+)\/delete$/);
    if(removed&&method==='POST') {
      const result=db.prepare('DELETE FROM lg_bookmarks WHERE id=? AND user_id=?').run(Number(removed[1]),user.id);
      if(!result.changes)fail(404,'Saved query not found.');
      audit('logs.bookmark.delete',{id:Number(removed[1]),actor:user.id});return {ok:true};
    }
    if(method!=='GET')fail(405,'Unsupported logs method.');
    if(path==='/api/logs/options')return {kinds:db.prepare('SELECT DISTINCT kind FROM events ORDER BY kind').all().map(r=>r.kind),severities:db.prepare('SELECT DISTINCT severity FROM events ORDER BY severity').all().map(r=>r.severity),actions:db.prepare('SELECT DISTINCT action FROM audit ORDER BY action').all().map(r=>r.action)};
    const detail=path.match(/^\/api\/logs\/events\/(\d+)$/);
    if(detail){const event=db.prepare('SELECT * FROM events WHERE id=?').get(Number(detail[1]));if(!event)fail(404,'Event not found.');return {event:row(event)};}
    if(!['/api/logs/events','/api/logs/audit','/api/logs/stats','/api/logs/export'].includes(path))fail(404,'Logs route not found.');
    const isAudit=path==='/api/logs/audit'||(path==='/api/logs/export'&&url.searchParams.get('type')==='audit');
    const {where,args,order,page,limit,bounds}=query(url.searchParams,isAudit),table=isAudit?'audit':'events';
    const total=db.prepare(`SELECT count(*) n FROM ${table}${where}`).get(...args).n;
    const map=isAudit?r=>({...r,details:JSON.parse(r.details)}):row;
    if(path==='/api/logs/events'||path==='/api/logs/audit')return {rows:db.prepare(`SELECT * FROM ${table}${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args,limit,(page-1)*limit).map(map),total,page,limit,bounds};
    if(path==='/api/logs/stats') {
      const group=field=>db.prepare(`SELECT ${field} label,count(*) count FROM events${where} GROUP BY ${field} ORDER BY count DESC,label`).all(...args);
      const extent=db.prepare(`SELECT min(at) first,max(at) last FROM events${where}`).get(...args);
      const hourly=extent.first&&Date.parse(extent.last)-Date.parse(extent.first)<=3*86400000;
      const timeline=db.prepare(`SELECT strftime('${hourly?'%Y-%m-%dT%H:00:00Z':'%Y-%m-%dT00:00:00Z'}',at) label,count(*) count FROM events${where} GROUP BY label ORDER BY label`).all(...args);
      return {total,bounds,byKind:group('kind'),byRule:group('rule'),bySeverity:group('severity'),timeline,bucket:hourly?'hour':'day'};
    }
    const format=url.searchParams.get('format')||'json';
    if(!['json','csv'].includes(format))fail(400,'Choose JSON or CSV.');
    if(total>10000)fail(413,'Export exceeds 10,000 rows. Narrow the date range or filters.');
    const rows=db.prepare(`SELECT * FROM ${table}${where} ORDER BY ${order}`).all(...args).map(map);
    let content=JSON.stringify(rows,null,2);
    if(format==='csv') {
      const columns=isAudit?['id','at','action','details']:['id','at','kind','playerId','playerName','rule','severity','reviewed','details'];
      const cell=value=>{let s=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
      content=[columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n');
    }
    return {filename:`${table}.${format}`,mime:format==='csv'?'text/csv;charset=utf-8':'application/json',content,count:total};
  }
  return {routes};
}
