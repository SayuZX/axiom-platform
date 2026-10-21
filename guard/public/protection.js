(() => {
  'use strict';
  let generation=0, actionDialog=null;
  const timers=new Set(), recordings=new Set(), urls=new Set();
  function dispose() {
    generation++;
    actionDialog?.close();
    for(const id of timers) clearTimeout(id);
    timers.clear();
    for(const r of recordings) { if(r.state!=='inactive') r.stop(); r.stream.getTracks().forEach(t=>t.stop()); }
    recordings.clear();
    for(const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  }
  function later(fn,ms) { const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id; }
  const canEdit=(c,permission='players')=>c.getUser()?.role==='owner'||(c.getUser()?.permissions||[]).includes(permission);
  function run(c,fn) { return Promise.resolve().then(fn).catch(e=>c.notice(e.message)); }
  function table(c,headers,rows) {const t=c.tableShell(headers);for(const r of rows)c.addRow(t.body,r);return t.wrap;}
  function target(c,players,id,serverSession) {
    const node=c.select(id,[['','Choose player'],...players.map(p=>[p.id,`#${p.id} · ${p.name}`])]);
    node.dataset.serverSession=serverSession||'';
    for(const option of node.options)option.dataset.session=players.find(p=>String(p.id)===option.value)?.sessionId||'';
    return node;
  }
  const selection=node=>({playerId:Number(node.value),playerSession:node.selectedOptions[0]?.dataset.session||'',serverSession:node.dataset.serverSession||''});
  function refreshButton(c,fn) {return c.button('Refresh',()=>run(c,fn));}
  async function waitCommand(c,id,active) {
    for(let i=0;i<35&&active();i++) {
      const {command}=await c.api(`protection/commands/${id}`);
      if(!['queued','dispatched'].includes(command.status)) return command;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw new Error('Receipt not yet received. The command may still execute; refresh command history before retrying.');
  }
  async function screenshot(c,player,active) {
    const {command}=await c.api('protection/commands',{type:'screenshot',...selection(player)});
    const result=await waitCommand(c,command.id,active);
    if(result.status!=='completed'||!result.data?.mediaId) throw new Error(result.message||result.status);
    return c.api(`protection/media/${result.data.mediaId}`);
  }
  function empty(c,root,message) { root.append(c.el('p','empty',message)); }
  function confirmAction(c,title,message,{targets=[],serverSession='',reason=false,label='Confirm'}={}) {
    return new Promise(resolve=>{
      const dialog=document.getElementById('dialog'),content=document.getElementById('dialog-content');
      const heading=c.el('h2','',title);heading.id='dialog-title';
      const description=c.el('p','',message);description.id='pg-confirm-description';
      content.replaceChildren(heading,description);dialog.setAttribute('aria-describedby',description.id);
      if(targets.length) {
        const list=c.el('ul','pg-confirm-targets');
        for(const p of targets)list.append(c.el('li','',`#${p.playerId} · ${p.name} · player session ${p.playerSession}`));
        content.append(c.el('p','muted',`Frozen snapshot: ${targets.length} player(s). Server session: ${serverSession}`),list);
      }
      const form=c.el('form','pg-confirm-form'),input=c.input('pg-action-reason','text');
      input.required=true;input.maxLength=256;input.autocomplete='off';
      if(reason)form.append(c.field('Reason (required, up to 256 characters)',input));
      const accept=c.button(label,()=>{},'primary');accept.type='submit';
      const cancel=document.getElementById('dialog-close');cancel.textContent='Cancel';
      let answer=null;
      form.addEventListener('submit',event=>{
        event.preventDefault();
        if(reason&&!input.value.trim()){input.setCustomValidity('Enter a reason.');input.reportValidity();return;}
        answer={reason:input.value.trim()};dialog.close();
      });
      input.addEventListener('input',()=>input.setCustomValidity(''));
      form.append(accept);content.append(form);actionDialog=dialog;
      dialog.addEventListener('close',()=>{actionDialog=null;dialog.removeAttribute('aria-describedby');resolve(answer);},{once:true});
      dialog.showModal();cancel.focus();
    });
  }
  function receiptFields(r) {
    return {'Command ID':r.id,Player:r.playerName,'Source ID':r.playerId,Action:r.preset||r.type,Test:r.test?'TEST · simulated detection':'No',Reason:r.reason,Status:r.status,Message:r.message,'Player session':r.playerSession,'Server session':r.serverSession,Created:r.createdAt,Dispatched:r.dispatchedAt,Completed:r.completedAt};
  }
  async function commandHistory(c,active,rows) {
    const result=await c.api('protection/commands');if(!active())return;
    rows.replaceChildren(table(c,['Time','Player','Action','Status','Receipt'],result.commands.map(r=>[c.date(r.createdAt),r.playerName,`${r.test?'TEST · ':''}${r.preset||r.type}`,r.status,c.button('Details',()=>c.details('Command receipt',receiptFields(r),r.data))])));
    if(!result.commands.length)empty(c,rows,'No commands queued.');
  }
  async function policyPage(c,page) {
    const result=await c.api('protection/policy'),p=result.policy;
    const root=c.el('div','pg-page'),card=c.card(page==='event-protection'?'Event protection':'Protection settings','Monitor mode never punishes automatically. Fresh protect mode applies configured actions only to server-observed events: cancel blocks the event, kick also disconnects, ban saves a local ban before disconnecting. Client, heartbeat and movement observations cannot punish. Confirmed manual Kick/Ban in Apollo override monitor mode.');
    const form=c.el('form','pg-policy');
    const eventRules=new Set(['explosion_rate','entity_rate','particle_rate','projectile_rate','weapon_damage','weapon_blacklist','entity_blacklist']);
    for(const [id,label] of Object.entries(result.ruleNames)) {
      if(page==='event-protection'&&!eventRules.has(id)) continue;
      const row=c.el('div','pg-policy-row'),enabled=c.input(`pg-${id}`,'checkbox');
      enabled.checked=p.rules[id].enabled;enabled.disabled=!canEdit(c,'config');
      enabled.addEventListener('change',()=>p.rules[id].enabled=enabled.checked);
      const mode=c.select(`pg-action-${id}`,eventRules.has(id)?[['monitor','Report only'],['cancel','Cancel in protect'],['kick','Kick in protect'],['ban','Local ban in protect']]:[['monitor','Observation only']]);
      mode.value=eventRules.has(id)?p.rules[id].action:'monitor';mode.disabled=!canEdit(c,'config')||!eventRules.has(id);
      mode.addEventListener('change',()=>p.rules[id].action=mode.value);
      row.append(c.field(label,enabled),c.field('Action',mode));form.append(row);
    }
    const lists={weapons:'Blocked weapon names / hashes',allowedWeapons:'Allowed weapons (override blacklist)',entities:'Blocked entity model names / hashes',allowedEntities:'Allowed entity models (override blacklist)'};
    for(const [key,label] of Object.entries(lists)) {
      const input=c.el('textarea');input.id=`pg-${key}`;input.rows=2;input.value=p[key].join(', ');input.disabled=!canEdit(c,'config');
      input.addEventListener('input',()=>p[key]=input.value.split(/[\s,]+/).filter(Boolean).map(v=>/^-?\d+$/.test(v)?Number(v):v));
      form.append(c.field(label,input));
    }
    const bypass=c.input('pg-bypass','checkbox');bypass.checked=p.adminBypass;bypass.disabled=!canEdit(c,'config');
    bypass.addEventListener('change',()=>p.adminBypass=bypass.checked);
    form.append(c.field(`Admin bypass · server ACE ${result.adminAce}`,bypass));
    const speed=c.input('pg-speed','number');speed.min=10;speed.max=1000;speed.value=p.movementSpeed;speed.disabled=!canEdit(c,'config');
    speed.addEventListener('input',()=>p.movementSpeed=Number(speed.value));form.append(c.field('Movement observation threshold (m/s)',speed));
    const zones=c.el('textarea');zones.id='pg-zones';zones.rows=4;zones.disabled=!canEdit(c,'config');
    zones.value=p.zones.map(z=>[z.name,z.x,z.y,z.z,z.radius].join(',')).join('\n');
    form.append(c.field('Exemption spheres · one name,x,y,z,radius per line (meters)',zones));
    if(canEdit(c,'config')) {
      const save=c.button('Save protection',()=>c.action(save,async()=>{
        p.zones=zones.value.split('\n').filter(s=>s.trim()).map(line=>{const [name,x,y,z,radius,...extra]=line.split(',');if(extra.length)throw new Error('Each zone needs five comma-separated fields.');return {name:name.trim(),x:Number(x),y:Number(y),z:Number(z),radius:Number(radius)};});
        await c.api('protection/policy',p);c.notice('Protection policy saved; applied on the next resource heartbeat.');
      }),'primary');form.append(save);
    }
    form.addEventListener('submit',e=>e.preventDefault());card.append(form);root.append(card);return root;
  }
  async function apollo(c,active) {
    const overview=await c.api('protection/overview'),root=c.el('div','pg-page');
    const controls=c.card('Apollo','Authenticated screenshots from screenshot-basic. Client-rendered evidence can be manipulated; not proof by itself.');
    const player=target(c,overview.server.players||[],'pg-apollo-player',overview.server.sessionId);
    const roster=c.card('Live players','Manual Kick/Ban are explicit administrative overrides, including in monitor mode. Kick uses AXIOM native DropPlayer, not txAdmin. Ban stores a permanent local ban then kicks; future connection enforcement requires protect mode. No invented trust score.');
    const rosterRows=c.el('div');let capture,testAll;
    const history=c.card('Action receipts','Queued and dispatched are pending, not success. A completed kick requires the resource to observe the exact player session disconnect. TEST actions simulate detection but really disconnect players.');
    const receiptRows=c.el('div'),actionStatus=c.el('pre','pg-output','No manual action submitted.');actionStatus.setAttribute('role','status');
    const loadHistory=()=>commandHistory(c,active,receiptRows);
    history.append(actionStatus,refreshButton(c,loadHistory),receiptRows);
    async function observe(commands) {
      actionStatus.textContent=commands.map(r=>`${r.test?'TEST · ':''}${r.id}: ${r.status} · ${r.playerName}`).join('\n');
      const results=await Promise.allSettled(commands.map(r=>waitCommand(c,r.id,active)));
      if(!active())return;
      actionStatus.textContent=results.map((r,i)=>r.status==='fulfilled'?`${commands[i].id}: ${r.value.status} · ${r.value.message||'No message'}`:`${commands[i].id}: ${r.reason.message}`).join('\n');
      await loadHistory();await refreshRoster();
    }
    async function punish(type,snapshot) {
      const accepted=await confirmAction(c,`${type==='ban'?'Ban':'Kick'} ${snapshot.name}?`,type==='ban'?'Create a permanent local ban, then disconnect this exact session. This manual action overrides monitor mode.':'Disconnect this exact session through AXIOM. This manual action overrides monitor mode.',{targets:[snapshot],serverSession:snapshot.serverSession,reason:true,label:type==='ban'?'Confirm permanent ban and kick':'Confirm kick'});
      if(!accepted||!active())return;
      const payload={playerId:snapshot.playerId,playerSession:snapshot.playerSession,serverSession:snapshot.serverSession,reason:accepted.reason,confirm:true};
      const result=await c.api(type==='ban'?'protection/ban':'protection/commands',type==='ban'?{...payload,expiresAt:null}:{...payload,type:'kick'});
      await observe([result.command]);
    }
    function drawRoster() {
      const list=overview.server.online?overview.server.players||[]:[];
      rosterRows.replaceChildren(table(c,['Source ID','Name','Native license','Ping','Health','Armor','Action'],list.map(p=>{
        const license=p.identifiers.find(i=>i.startsWith('license:'))||p.identifiers.find(i=>i.startsWith('license2:'))||'Unavailable';
        const actions=c.el('div','pg-tools');
        const snapshot={playerId:p.id,playerSession:p.sessionId,serverSession:overview.server.sessionId,name:p.name};
        if(canEdit(c)) {
          const shot=c.button('Screenshot',()=>c.action(shot,async()=>{
            const chosen=target(c,[p],'pg-row-capture',snapshot.serverSession);chosen.value=String(p.id);
            await screenshot(c,chosen,active);if(active()){status.textContent=`Screenshot stored for ${p.name}.`;await load();await loadHistory();}
          }));shot.disabled=!overview.server.capabilities?.screenshots;shot.setAttribute('aria-label',`Screenshot ${p.name} #${p.id}`);actions.append(shot);
          for(const type of ['kick','ban']) {
            if(type==='ban'&&!canEdit(c,'bans'))continue;
            const action=c.button(type==='kick'?'Kick':'Ban',()=>c.action(action,()=>punish(type,snapshot)));
            action.disabled=!overview.server.capabilities?.kick;action.setAttribute('aria-label',`${type==='kick'?'Kick':'Ban'} ${p.name} #${p.id}`);actions.append(action);
          }
        } else actions.append(c.button('Details',()=>c.details(p.name,{ID:p.id,License:license,Ping:p.ping,Health:p.health,Armor:p.armor})));
        return [p.id,p.name,license,`${p.ping} ms`,p.health??'Unavailable',p.armor??'Unavailable',actions];
      })));
      if(!list.length)empty(c,rosterRows,'No live players reported.');
    }
    const refreshRoster=async()=>{
      const fresh=await c.api('protection/overview');if(!active())return;
      const selected=selection(player);overview.server=fresh.server;
      const options=target(c,fresh.server.online?fresh.server.players||[]:[],'pg-new-options',fresh.server.sessionId);player.replaceChildren(...options.children);player.dataset.serverSession=options.dataset.serverSession;
      const same=Array.from(player.options).find(o=>o.dataset.session===selected.playerSession&&Number(o.value)===selected.playerId&&selected.serverSession===fresh.server.sessionId);
      player.value=same?.value||'';if(capture)capture.disabled=!fresh.server.online||!fresh.server.capabilities?.screenshots;
      if(testAll)testAll.disabled=!fresh.server.online||!fresh.server.capabilities?.kick||!fresh.server.players?.length;
      drawRoster();
    };
    if(c.getUser()?.role==='owner') {
      testAll=c.button('TEST · Kick all snapshot players',()=>c.action(testAll,async()=>{
        const fresh=await c.api('protection/overview');if(!active())return;
        if(!fresh.server.online||!fresh.server.capabilities?.kick)throw new Error('Native kick resource is unavailable.');
        const serverSession=fresh.server.sessionId;
        const targets=(fresh.server.players||[]).map(p=>({playerId:p.id,playerSession:p.sessionId,name:p.name}));
        if(!targets.length)throw new Error('No live players to test.');
        const accepted=await confirmAction(c,`TEST: kick ${targets.length} players?`,'This is a real disconnect for every player listed below, including administrators. It simulates detection, not cheating evidence. No ban is created. Late joiners are excluded; stale sessions reject the whole request. Manual test overrides monitor mode.',{targets,serverSession,reason:true,label:`Confirm TEST: disconnect ${targets.length} players`});
        if(!accepted||!active())return;
        const result=await c.api('protection/kick-all',{targets:targets.map(({playerId,playerSession})=>({playerId,playerSession})),serverSession,reason:accepted.reason,confirm:true,test:true});
        await observe(result.commands);
      }));
      testAll.disabled=!overview.server.online||!overview.server.capabilities?.kick||!overview.server.players?.length;roster.append(testAll);
    }
    roster.append(refreshButton(c,refreshRoster),rosterRows);drawRoster();
    const status=c.el('p','muted','Snapshots are stored privately until an administrator deletes them.');status.setAttribute('role','status');
    const gallery=c.el('div','pg-gallery'),paging=c.el('div','pg-tools');let offset=0,nextOffset=null;
    const previous=c.button('Newer screenshots',()=>run(c,async()=>{offset=Math.max(0,offset-100);await load();}));
    const next=c.button('Older screenshots',()=>run(c,async()=>{if(nextOffset!==null){offset=nextOffset;await load();}}));paging.append(previous,next);
    const load=async()=>{
      const result=await c.api(`protection/media?offset=${offset}`);if(!active())return;
      nextOffset=result.nextOffset;previous.disabled=offset===0;next.disabled=nextOffset===null;
      gallery.replaceChildren();
      if(!result.media.length)empty(c,gallery,'No screenshots in this page.');
      for(const m of result.media) {
        const card=c.card(m.playerName,`${c.date(m.createdAt)} · ${c.number(m.bytes)} bytes`);
        const view=c.button('View screenshot',()=>c.action(view,async()=>{
          const data=await c.api(`protection/media/${m.id}`);if(!active())return;
          const img=c.el('img','pg-image');img.alt=`Screenshot of ${m.playerName} at ${c.date(m.createdAt)}`;img.src=data.image;card.append(img);view.remove();
        }));card.append(view);
        if(canEdit(c))card.append(c.button('Delete',()=>run(c,async()=>{if(!await confirmAction(c,'Delete screenshot?',`Permanently delete the screenshot of ${m.playerName} from ${c.date(m.createdAt)}?`,{label:'Permanently delete'})||!active())return;await c.api(`protection/media/${m.id}/remove`,{});await load();})));
        gallery.append(card);
      }
    };
    if(canEdit(c)) {
      capture=c.button('Capture screenshot',()=>c.action(capture,async()=>{
        if(!player.value)throw new Error('Choose a player.');status.textContent='Waiting for the resource and screenshot callback…';
        try {await screenshot(c,player,active);if(!active())return;status.textContent='Screenshot stored.';await load();await loadHistory();} catch(e){status.textContent=e.message;throw e;}
      }),'primary');capture.disabled=!overview.server.online||!overview.server.capabilities?.screenshots;
      controls.append(c.field('Live player',player),capture);
    }
    controls.append(status,refreshButton(c,load));root.append(roster,controls,history,gallery,paging);await Promise.all([load(),loadHistory()]);return root;
  }
  function recorderControls(c,canvas,active) {
    const controls=c.el('div','pg-tools');
    if(typeof MediaRecorder==='undefined'||typeof canvas.captureStream!=='function') {
      controls.append(c.el('p','muted','This browser cannot record the snapshot canvas.'));return controls;
    }
    let recorder,parts=[];
    const start=c.button('Record snapshots',()=>run(c,()=>{
      if(!canvas.dataset.captured)throw new Error('Capture an image before recording.');
      const stream=canvas.captureStream(1);
      try {recorder=new MediaRecorder(stream);} catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
      parts=[];recordings.add(recorder);
      recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
      recorder.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());recordings.delete(recorder);start.disabled=false;stop.disabled=true;
        if(!active()||!parts.length)return;
        const url=URL.createObjectURL(new Blob(parts,{type:recorder.mimeType}));urls.add(url);
        const download=c.el('a','pg-download','Download recorded snapshot video');download.href=url;download.download=`axiom-snapshots-${Date.now()}.${recorder.mimeType.includes('mp4')?'mp4':'webm'}`;controls.append(download);
      };
      recorder.onerror=e=>c.notice(e.error?.message||'Recording failed.');
      recorder.start(1000);start.disabled=true;stop.disabled=false;
    }));
    const stop=c.button('Stop recording',()=>{if(recorder?.state==='recording')recorder.stop();});stop.disabled=true;
    controls.append(start,stop,c.el('small','muted','1 fps canvas recording of periodic images. No game video stream or audio.'));return controls;
  }
  async function streams(c,active) {
    const overview=await c.api('protection/overview'),root=c.el('div','pg-page');
    const setup=c.card('Live image monitor','1–16 screenshot panels. Not real-time video; the resource polls commands every 5 seconds. No audio.');
    const count=c.input('pg-panel-count','number');count.min=1;count.max=16;count.value=1;
    const interval=c.select('pg-refresh',[[5,'5 seconds after each response'],[10,'10 seconds after each response'],[30,'30 seconds after each response'],[60,'60 seconds after each response']]);
    const grid=c.el('div','pg-monitors');let panels=[],running=false,cycle=0;
    setup.append(c.field('Panels (1–16)',count),c.field('Requested refresh delay',interval));
    function build() {
      const n=Number(count.value);if(!Number.isInteger(n)||n<1||n>16)throw new Error('Choose 1–16 panels.');
      running=false;cycle++;
      for(const r of recordings) {if(r.state!=='inactive')r.stop();r.stream.getTracks().forEach(t=>t.stop());}recordings.clear();
      grid.replaceChildren();panels=[];
      for(let i=0;i<n;i++) {
        const card=c.card(`Monitor ${i+1}`,'No image received'),player=target(c,overview.server.players||[],`pg-monitor-${i}`,overview.server.sessionId);
        const canvas=c.el('canvas','pg-canvas');canvas.width=640;canvas.height=360;canvas.setAttribute('aria-label',`Monitor ${i+1} screenshot`);
        const status=c.el('p','muted','Choose a player.');status.setAttribute('role','status');
        const panel={player,canvas,status,last:null};panels.push(panel);
        player.addEventListener('change',()=>{panel.last=null;canvas.getContext('2d').clearRect(0,0,640,360);delete canvas.dataset.captured;});
        card.append(c.field('Player',player),canvas,status,recorderControls(c,canvas,active));grid.append(card);
      }
    }
    async function tick(panel,token) {
      if(!running||!active()||token!==cycle||!panel.player.value)return;
      const chosen=panel.player.value;
      panel.status.textContent='Waiting for screenshot…';
      try {
        let m;
        if(canEdit(c))m=await screenshot(c,panel.player,()=>active()&&running&&token===cycle);
        else {
          const listing=await c.api('protection/media');const latest=listing.media.find(m=>m.playerSession===selection(panel.player).playerSession&&m.playerId===Number(chosen));
          if(!latest)throw new Error('No stored screenshot for this player. An administrator must capture one.');
          m=await c.api(`protection/media/${latest.id}`);
        }
        if(!active()||token!==cycle||chosen!==panel.player.value)return;
        const image=new Image();image.src=m.image;await image.decode();
        if(!active()||token!==cycle||chosen!==panel.player.value)return;
        panel.canvas.getContext('2d').drawImage(image,0,0,640,360);panel.canvas.dataset.captured='true';
        const stamp=Date.parse(m.createdAt),elapsed=panel.last&&stamp!==panel.last?(stamp-panel.last)/1000:null;panel.last=stamp;
        panel.status.textContent=`Captured ${c.date(m.createdAt)}${elapsed?` · Actual image interval ${elapsed.toFixed(1)}s`:''} · Next request in ${interval.value}s`;
      } catch(e) {panel.status.textContent=e.message;}
      if(running&&active()&&token===cycle)later(()=>tick(panel,token),Number(interval.value)*1000);
    }
    setup.append(c.button('Apply layout',()=>run(c,build)),c.button('Refresh roster',()=>run(c,async()=>{
      const fresh=await c.api('protection/overview');overview.server=fresh.server;build();
      if(canEdit(c))start.disabled=!fresh.server.online||!fresh.server.capabilities?.screenshots;
    })));
    const start=c.button(canEdit(c)?'Start image capture':'Watch stored images',()=>run(c,()=>{
      const chosen=panels.filter(p=>p.player.value);if(!chosen.length)throw new Error('Select a player in a panel.');
      if(new Set(chosen.map(p=>p.player.value)).size!==chosen.length)throw new Error('Use each player once.');
      running=true;const token=++cycle;chosen.forEach(p=>tick(p,token));
    }),'primary');
    if(canEdit(c))start.disabled=!overview.server.online||!overview.server.capabilities?.screenshots;
    setup.append(start,c.button('Stop capture',()=>{running=false;cycle++;}));
    root.append(setup,grid);build();return root;
  }
  async function scripts(c,active) {
    const data=await c.api('protection/overview'),root=c.el('div','pg-page');
    const controls=c.card('Server scripts','Owner Lua executes in a memory/instruction-limited native worker against the selected player snapshot. inspect() reads that snapshot; disarm(), freeze(boolean) and teleport(x,y,z) queue validated game operations. No OS/file/network APIs.');
    const player=target(c,data.server.players||[],'pg-script-player',data.server.sessionId);
    const preset=c.select('pg-preset',data.presets.map(p=>[p.id,p.label]));
    const output=c.el('pre','pg-output','No command selected.');output.setAttribute('role','status');
    if(c.getUser()?.role==='owner'){
      const saved=await c.api('protection/scripts'),name=c.input('pg-script-name','text'),code=c.el('textarea','pg-script-editor');
      code.id='pg-script-code';code.setAttribute('aria-label','Lua code');
      name.placeholder='Script name';name.maxLength=80;code.rows=14;code.maxLength=16384;code.spellcheck=false;code.value='local state = inspect()\nprint(player.name, state.health)\nreturn state';
      const choose=c.select('pg-saved-script',[['','New script'],...saved.scripts.map(s=>[s.id,s.name])]);
      choose.addEventListener('change',()=>{const item=saved.scripts.find(s=>String(s.id)===choose.value);if(item){name.value=item.name;code.value=item.code;}});
      const bar=c.el('div','pg-tools');
      async function reloadScripts(selected){const latest=await c.api('protection/scripts');saved.scripts=latest.scripts;const options=c.select('temporary',[['','New script'],...saved.scripts.map(s=>[s.id,s.name])]);choose.replaceChildren(...options.children);choose.value=selected?String(selected):'';}
      const save=c.button('Save script',()=>c.action(save,async()=>{if(!name.value.trim())throw new Error('Script name required.');const id=choose.value;const result=await c.api(id?'protection/scripts/'+id:'protection/scripts',{name:name.value,code:code.value});await reloadScripts(id||result.id);c.notice('Script saved.');}),'primary');
      const execute=c.button('Execute code',()=>c.action(execute,async()=>{
        if(!player.value)throw new Error('Choose a live player.');const snapshot={...selection(player),name:player.selectedOptions[0].textContent};
        if(!await confirmAction(c,'Execute owner Lua script?','This script can disarm, freeze or teleport the selected player. Review the code before execution.',{targets:[snapshot],serverSession:snapshot.serverSession,label:'Execute script'}))return;
        const result=await c.api('protection/commands',{type:'script',...snapshot,code:code.value,confirm:true});output.textContent='Queued '+result.command.id;
        const receipt=await waitCommand(c,result.command.id,active);if(active())output.textContent=JSON.stringify({...receiptFields(receipt),Data:receipt.data},null,2);
      }));execute.disabled=!data.server.online||!data.server.capabilities?.scripts;
      const remove=c.button('Delete saved script',()=>c.action(remove,async()=>{if(!choose.value)throw new Error('Choose a saved script.');if(!await confirmAction(c,'Delete script?',name.value,{label:'Delete script'}))return;await c.api('protection/scripts/'+choose.value+'/remove',{});await reloadScripts();name.value='';c.notice('Script deleted.');}));
      bar.append(save,execute,remove);controls.append(c.field('Saved scripts',choose),c.field('Name',name),c.field('Lua code',code),bar);
    }
    if(canEdit(c)) {
      const execute=c.button('Execute preset',()=>c.action(execute,async()=>{
        const definition=data.presets.find(p=>p.id===preset.value);
        if(!player.value)throw new Error('Choose a player.');
        const snapshot={...selection(player),name:player.selectedOptions[0].textContent},presetId=preset.value;
        if(definition.destructive&&!await confirmAction(c,'Remove all weapons?',`This changes the live player ${snapshot.name}.`,{targets:[snapshot],serverSession:snapshot.serverSession,label:'Confirm disarm'}))return;
        if(!active())return;
        const {command}=await c.api('protection/commands',{type:'preset',playerId:snapshot.playerId,playerSession:snapshot.playerSession,serverSession:snapshot.serverSession,preset:presetId,confirm:definition.destructive});
        output.textContent=`Queued ${command.id}; waiting for resource heartbeat…`;
        const result=await waitCommand(c,command.id,active);if(!active())return;output.textContent=JSON.stringify({...receiptFields(result),Data:result.data},null,2);await load();
      }),'primary');execute.disabled=!data.server.online||!data.server.capabilities?.presets;
      controls.append(c.field('Player',player),c.field('Native preset',preset),execute);
    }
    controls.append(output);const history=c.card('Command history','Session-bound commands expire after 30 seconds. Queued and dispatched are pending, not successful execution. Completed kicks require an observed disconnect receipt.');
    const rows=c.el('div');history.append(rows);
    const load=()=>commandHistory(c,active,rows);
    history.append(refreshButton(c,load));
    const resources=c.card('Resources','Actual server resource states. Entity/firewall policies are configured under Event protection; unrelated resource files are never rewritten.');
    resources.append(table(c,['Resource','State'],(data.server.resources||[]).map(r=>[r.name,r.state])));
    if(!data.server.resources?.length)empty(c,resources,'No resource metadata received.');
    root.append(controls,history,resources);await load();return root;
  }
  async function mapPage(c,active) {
    const root=c.el('div','pg-page'),card=c.card('Live coordinate map','Raw server-native GTA coordinates in meters. Auto-fit X/Y plot; no proprietary map tiles. Z is shown in the roster.');
    const canvas=c.el('canvas','pg-map');canvas.width=1000;canvas.height=600;canvas.setAttribute('aria-label','Player X/Y positions; equivalent coordinates listed below.');
    const stamp=c.el('p','muted'),rows=c.el('div');
    async function load() {
      const data=await c.api('protection/map');if(!active())return;
      stamp.textContent=`${data.online?'Connected':'Offline'} · Last resource telemetry ${c.date(data.lastSeen)}`;
      const players=data.players.filter(p=>p.position&&['x','y','z'].every(k=>Number.isFinite(p.position[k])));
      const g=canvas.getContext('2d');g.fillStyle='#181a1c';g.fillRect(0,0,1000,600);g.font='14px sans-serif';
      if(players.length) {
        const xs=players.map(p=>p.position.x),ys=players.map(p=>p.position.y);
        const minX=Math.min(...xs)-100,maxX=Math.max(...xs)+100,minY=Math.min(...ys)-100,maxY=Math.max(...ys)+100;
        g.strokeStyle='#34383b';g.fillStyle='#a1988c';
        for(let i=0;i<=5;i++) {
          const x=60+i*176,y=40+i*100;g.beginPath();g.moveTo(x,40);g.lineTo(x,540);g.moveTo(60,y);g.lineTo(940,y);g.stroke();
          g.fillText((minX+(maxX-minX)*i/5).toFixed(0),x-20,570);g.fillText((maxY-(maxY-minY)*i/5).toFixed(0),4,y+4);
        }
        g.fillText('X (m)',900,595);g.fillText('Y (m)',5,20);
        for(const p of players) {
          const x=60+(p.position.x-minX)/(maxX-minX)*880,y=540-(p.position.y-minY)/(maxY-minY)*500;
          g.fillStyle='#b35027';g.beginPath();g.arc(x,y,6,0,Math.PI*2);g.fill();g.fillStyle='#fff';g.fillText(`#${p.id}`,x+9,y-8);
        }
      } else {g.fillStyle='#a1988c';g.fillText('No live player coordinates received.',40,60);}
      rows.replaceChildren(table(c,['ID','Player','X (m)','Y (m)','Z (m)'],data.players.map(p=>[p.id,p.name,...['x','y','z'].map(k=>p.position?.[k]?.toFixed(2)??'Unavailable')])));
    }
    card.append(stamp,refreshButton(c,load),canvas,rows);root.append(card);await load();
    const poll=async()=>{try{await load();}catch(e){c.notice(e.message);}if(active())later(poll,5000);};later(poll,5000);return root;
  }
  async function leaderboard(c,active) {
    const root=c.el('div','pg-page'),card=c.card('Local telemetry leaderboard','Observed event counts, not guilt or a fabricated cheat score. Counts begin when identity telemetry is received.');
    const rows=c.el('div');
    const load=async()=>{
      const data=await c.api('protection/leaderboard');if(!active())return;
      rows.replaceChildren(table(c,['Player','Native license','Detections','Connections','Last event'],data.players.map(p=>[p.name,p.license,c.number(p.detections),c.number(p.connections),c.date(p.lastSeen)])));
      if(!data.players.length)empty(c,rows,'No licensed player events received.');
    };
    card.append(refreshButton(c,load),rows);root.append(card);await load();return root;
  }
  async function render(page,c) {
    dispose();const token=generation,active=()=>token===generation&&(!c.isCurrent||c.isCurrent());
    if(page==='protections'||page==='event-protection')return policyPage(c,page);
    if(page==='apollo')return apollo(c,active);
    if(page==='streams')return streams(c,active);
    if(page==='scripts')return scripts(c,active);
    if(page==='map')return mapPage(c,active);
    if(page==='leaderboard')return leaderboard(c,active);
    return c.el('div');
  }
  window.GuardProtection={render,dispose};
})();
