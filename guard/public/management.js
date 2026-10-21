'use strict';
window.GuardManagement = (() => {
  const pages = new Set(['server','storage','identities','threats','whitelist']);
  let controlId=0;
  function admin(c,permission='bans') { return c.getUser()?.role==='owner'||(c.getUser()?.permissions||[]).includes(permission); }
  function link(c,label,run) {
    const node = c.el('a','mg-link',label); node.href='#identities';
    node.addEventListener('click',event => { event.preventDefault(); Promise.resolve().then(run).catch(error => c.notice(error.message)); });
    return node;
  }
  function copy(c,label,value) {
    const button=c.button(label,()=>c.action(button,async()=>{
      if(!navigator.clipboard)throw new Error('Clipboard unavailable. Select and copy the displayed value.');
      await navigator.clipboard.writeText(String(value)); c.notice('Copied.');
    })); return button;
  }
  function download(c,name,href) {
    const anchor=c.el('a'); anchor.href=href; anchor.download=name;
    document.body.append(anchor); anchor.click(); anchor.remove();
  }
  function modal(c,root,title) {
    const dialog = c.el('dialog','mg-dialog'), heading = c.el('h2','',title);
    heading.id='mg-dialog-title'; dialog.setAttribute('aria-labelledby',heading.id);
    const close = c.button('Close',() => dialog.close());
    dialog.append(heading,close); root.append(dialog);
    dialog.addEventListener('close',() => dialog.remove(),{once:true});
    return dialog;
  }
  function pairs(c,values) {
    const list = c.el('dl','mg-meta');
    for (const [key,value] of Object.entries(values)) list.append(c.el('dt','',key),c.el('dd','',value ?? 'Not reported'));
    return list;
  }
  function pager(c,data,load) {
    const bar=c.el('form','mg-pager'), count=Math.max(1,Math.ceil(data.total/data.limit));
    const id=++controlId,page=c.input(`mg-page-${id}`,'number'),size=c.select(`mg-size-${id}`,[8,25,50,100].map(n=>[String(n),String(n)]));
    page.min=1; page.max=count; page.value=data.page; page.required=true; size.value=String(data.limit);
    const previous=c.button('Previous',()=>load(data.page-1,data.limit)), next=c.button('Next',()=>load(data.page+1,data.limit));
    previous.disabled=data.page<=1; next.disabled=data.page>=count;
    const go=c.button('Go',()=>{}); go.type='submit';
    bar.addEventListener('submit',event=>{event.preventDefault();if(bar.reportValidity())load(Number(page.value),data.limit);});
    size.addEventListener('change',()=>load(1,Number(size.value)));
    bar.append(c.el('span','',`${c.number(data.total)} records · ${count} pages`),previous,c.field('Page',page),go,next,c.field('Per page',size));
    return bar;
  }
  function searchable(c,root,title,subtitle,endpoint,draw) {
    const panel=c.card(title,subtitle), form=c.el('form','mg-search'), query=c.input('mg-search');
    query.placeholder='Search name, UID or native identifier'; const submit=c.button('Search',()=>{}); submit.type='submit';
    const sort=c.select('mg-sort',[['created','Newest created'],['name','Name'],['lastSeen','Last seen']]);
    const result=c.el('div','mg-results'); let request=0,limit=25,current=1;
    const load=async (page=1,size=limit)=>{
      const version=++request;
      limit=size; current=page;
      try {
        const data=await c.api(`${endpoint}?q=${encodeURIComponent(query.value)}&page=${page}&limit=${limit}&sort=${sort.value}`);
        if(version!==request || !c.isCurrent()) return;
        result.replaceChildren(pager(c,data,load),draw(data),pager(c,data,load));
      } catch(error) { if(version===request) c.notice(error.message); }
    };
    form.append(c.field('Search local records (press /)',query),c.field('Sort',sort),submit,c.button('Refresh',()=>load(current)));
    form.addEventListener('submit',event=>{event.preventDefault();load(1);}); sort.addEventListener('change',()=>load(1));
    const shortcut=event=>{
      if(!c.isCurrent()){document.removeEventListener('keydown',shortcut);return;}
      if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!document.querySelector('dialog[open]')&&!event.target.closest('input,textarea,select,[contenteditable]')){event.preventDefault();query.focus();}
    };
    document.addEventListener('keydown',shortcut);
    panel.append(form); root.append(panel,result);
    return {panel,load};
  }
  async function identityDetail(c,root,uid) {
    const data=await c.api(`identities/${encodeURIComponent(uid)}`);
    if(!c.isCurrent()) return;
    const person=data.identity, dialog=modal(c,root,person.name || 'Local identity');
    dialog.append(c.el('p','mg-note','Local server history only. Linked identities share native identifiers; names and IP addresses never establish a link.'));
    dialog.append(pairs(c,{UID:person.uid,'First seen':c.date(person.firstSeen),'Last seen':c.date(person.lastSeen),'Recorded connections':c.number(person.connections)}));
    dialog.append(copy(c,'Copy UID',person.uid),copy(c,'Copy profile JSON',JSON.stringify(data,null,2)));
    const ids=c.el('div','mg-identifiers');
    for(const id of person.identifiers) {const row=c.el('div','mg-actions');row.append(c.el('code','',id),copy(c,'Copy identifier',id));ids.append(row);}
    dialog.append(c.el('h3','','Native identifiers'),ids,c.el('h3','','Linked identities'));
    if(!data.aliases.length) dialog.append(c.el('p','mg-note','No other local identity is linked.'));
    for(const alias of data.aliases) dialog.append(link(c,`${alias.name} · ${alias.uid}`,() => { dialog.close(); return identityDetail(c,root,alias.uid); }));
    const graph=c.el('details','mg-graph'), graphTitle=c.el('summary','','View linked identity graph');
    graph.append(graphTitle,c.el('p','mg-note','One connected component from shared native identifiers; connections may be indirect.'));
    const members=c.el('div','mg-graph-members');
    for(const member of [person,...data.aliases])members.append(link(c,`${member.name || 'Unnamed'} · ${member.uid}`,()=>{dialog.close();return identityDetail(c,root,member.uid);}));
    graph.append(members);dialog.append(graph);
    dialog.append(c.el('h3','','Name history'));
    for(const name of data.names) dialog.append(c.el('p','mg-note',`${name.name} · ${c.date(name.firstSeen)} — ${c.date(name.lastSeen)}`));
    dialog.append(c.el('h3','','Recent sessions'));
    const sessions=c.tableShell(['Server ID','First observed','Last observed','Ended']);
    for(const item of data.sessions) c.addRow(sessions.body,[item.playerId,c.date(item.firstSeen),c.date(item.lastSeen),item.endedAt?c.date(item.endedAt):'Last observed open']);
    dialog.append(sessions.wrap,c.el('h3','','Recent linked events'));
    const events=c.tableShell(['Time','Player','Event','Evidence']);
    for(const event of data.events) {
      const evidence=c.el('details'), title=c.el('summary','','View evidence');
      evidence.append(title,c.el('pre','mg-evidence',JSON.stringify(event.details,null,2)));
      c.addRow(events.body,[c.date(event.at),event.playerName,`${event.kind} · ${event.rule}`,evidence]);
    }
    dialog.append(events.wrap,c.el('p','mg-note',`Showing latest ${data.historyLimit} sessions and linked events. Connections count only received connection events.`));
    dialog.showModal();
  }
  function recordForm(c,root,kind,reload,existing) {
    const ban=kind==='threats', dialog=modal(c,root,existing?'Edit local bypass':ban?'Create local ban':'Create local bypass');
    const form=c.el('form','mg-form'), uid=c.input('mg-uid','text'), reason=c.input('mg-reason','text'), expiry=c.input('mg-expiry','datetime-local');
    uid.required=true; uid.maxLength=160; uid.placeholder='UID from Identities'; uid.value=existing?.uid || ''; uid.readOnly=!!existing;
    reason.required=true; reason.maxLength=1000; reason.value=existing?.reason || '';
    if(existing?.expiresAt) {
      const date=new Date(existing.expiresAt), local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
      expiry.value=local.toISOString().slice(0,16);
    }
    const uidField=c.field('Local identity UID',uid), reasonField=c.field('Reason',reason), expiryField=c.field('Expires at (local time; blank means no expiry)',expiry);
    form.append(uidField,reasonField,expiryField);
    const warning=ban?'This creates a local ban using stored native identifiers and linked identities. Protect mode denies matching connections; monitor mode only records would-deny. No global network is involved.':'This bypasses local bans for linked identities. It does not grant staff privileges or bypass protection rules. No Fini or global approval.';
    form.append(c.el('p','mg-note',warning));
    let confirm,disconnect;
    if(ban) {
      confirm=c.input('mg-confirm','checkbox'); confirm.required=true;
      form.append(c.field('I confirm this local ban and its linked-identity scope.',confirm));
      disconnect=c.input('mg-disconnect','checkbox');
      form.append(c.field('Also disconnect the selected UID now through AXIOM (manual override).',disconnect));
    }
    const save=c.button(existing?'Save bypass':ban?'Confirm local ban':'Submit bypass',() => {},'primary'); save.type='submit';
    form.append(save); dialog.append(form);
    if(!ban&&!existing){
      let step=0; const title=c.el('h3'),review=c.el('div'),controls=c.el('div','mg-actions');
      const valid=()=>[uid,reason,expiry].filter((_,i)=>step===0?i===0:i>0).every(input=>input.reportValidity());
      const back=c.button('Back',()=>{step--;draw();}), next=c.button('Next',()=>{if(valid()){step++;draw();}});
      const reset=c.button('Reset',()=>{form.reset();step=0;draw();});
      const draw=()=>{
        title.textContent=`Step ${step+1} of 3 · ${['Identity','Reason and expiry','Review'][step]}`;
        uidField.hidden=step!==0;reasonField.hidden=expiryField.hidden=step!==1;
        back.disabled=step===0;next.hidden=step===2;save.hidden=step!==2;review.hidden=step!==2;
        review.replaceChildren(pairs(c,{UID:uid.value,Reason:reason.value,Expiry:expiry.value||'No expiry'}));
      };
      controls.append(back,next,reset,save);form.prepend(title);form.append(review,controls);form.noValidate=true;
      form.addEventListener('submit',event=>{if(step!==2){event.preventDefault();event.stopImmediatePropagation();if(valid()){step++;draw();}}});
      draw();
    }
    form.addEventListener('submit',event => {
      event.preventDefault();
      c.action(save,async () => {
        const body={reason:reason.value,expiresAt:expiry.value?new Date(expiry.value).toISOString():null};
        if(!existing) body.uid=uid.value;
        if(ban) body.confirmed=confirm.checked;
        if(ban&&disconnect.checked){
          const live=c.getState().server,normalized=uid.value.trim().toLowerCase();
          const player=live.players.find(p=>p.identifiers.some(id=>id.toLowerCase()==='license:'+normalized||id.toLowerCase()==='license2:'+normalized));
          if(!live.online||!player)throw new Error('This UID is not in the live roster. Refresh Apollo or uncheck disconnect.');
          if(reason.value.length>256)throw new Error('Disconnect reason must be at most 256 characters.');
          const result=await c.api('protection/ban',{playerId:player.id,playerSession:player.sessionId,serverSession:live.sessionId,reason:reason.value,expiresAt:body.expiresAt,confirm:confirm.checked});
          c.notice(`Local ban saved. Native disconnect ${result.command.id} is queued; check Apollo action receipts.`);
        }else await c.api(`${kind}${existing?`/${existing.id}`:''}`,body);
        dialog.close(); await reload(1);
      });
    });
    dialog.showModal();
  }
  function identities(c,root) {
    const view=searchable(c,root,'Player identities','Persistent local history · search UID, current or previous name, or native identifier. Exact shared identifiers expand the local graph.','identities',data => {
      const panel=c.card('Local identity directory'), table=c.tableShell(['Player','UID','First seen','Last seen','Connections']);
      for(const person of data.identities) c.addRow(table.body,[link(c,person.name || 'Unnamed player',() => identityDetail(c,root,person.uid)),c.el('code','',person.uid),c.date(person.firstSeen),c.date(person.lastSeen),c.number(person.connections)]);
      panel.append(table.wrap);
      if(!data.identities.length) panel.append(c.el('p','empty','No matching native-license identities received. Players without a native license are not merged by name or IP.'));
      return panel;
    });
    return view.load(1);
  }
  function threats(c,root) {
    const view=searchable(c,root,'Search threats','Local bans. Monitor records would-deny; Protect enforces the current policy.','threats',data => {
      const list=c.card('Latest threats'),grid=c.el('div','mg-threat-grid');list.classList.add('mg-threat-list');
      for(const item of data.threats) {
        const panel=c.card(item.name || 'Local identity',`Ban #${item.id} · ${item.status}`); panel.classList.add('mg-threat');
        panel.append(link(c,item.uid,() => identityDetail(c,root,item.uid)),pairs(c,{Reason:item.reason,Created:c.date(item.createdAt),Expires:item.expiresAt?c.date(item.expiresAt):'No expiry',Administrator:item.actor}));
        const evidence=c.el('details'), summary=c.el('summary','','Stored evidence');
        const observations=item.evidence.detections || [];
        evidence.append(summary,c.el('pre','mg-evidence',JSON.stringify(item.evidence,null,2)));
        const latest=observations[0];
        panel.append(c.el('pre','mg-evidence',latest?`${latest.rule} · ${latest.severity}\n${c.date(latest.at)}\n${observations.length} local detection records attached`:'Manual local ban\nNo detection records attached.'),c.el('p','mg-note',`Native identifier hash ${item.evidence.identifierHash.slice(0,12)} · Enforcement follows Protect mode and local bypasses.`),evidence);
        const menu=c.el('details','mg-menu');menu.append(c.el('summary','','More actions'));
        const identity=c.button('View identity',()=>c.action(identity,()=>identityDetail(c,root,item.uid)));
        menu.append(identity,copy(c,'Copy UID',item.uid),c.button('Evidence',()=>{evidence.open=true;evidence.scrollIntoView({block:'nearest'});}));
        panel.append(menu);
        if(admin(c) && item.status==='active') {
          const revoke=c.button('Revoke ban',() => {
            if(!window.confirm(`Revoke local ban #${item.id} for ${item.name}?`)) return;
            c.action(revoke,async () => { await c.api(`threats/${item.id}/revoke`,{}); await view.load(data.page); });
          }); menu.append(revoke);
        }
        grid.append(panel);
      }
      if(!data.threats.length)grid.append(c.el('p','empty','No local bans match this search. Automatic bans require an enabled Ban rule in fresh Protect mode.'));
      list.append(grid);return list;
    });
    if(admin(c)) view.panel.querySelector('.section-head').append(c.button('Add local ban',() => recordForm(c,root,'threats',view.load),'primary'));
    view.panel.append(c.el('p','mg-note','Global ban requests are unavailable: this installation stores and enforces local bans only.'));
    return view.load(1);
  }
  function whitelist(c,root) {
    const view=searchable(c,root,'Local whitelist','Local ban bypass only · linked native identities · no global approvals or staff permissions.','whitelist',data => {
      const panel=c.card('Bypass records'), table=c.tableShell(['Identity','Reason','Expiry','Status','Actions']);
      for(const item of data.entries) {
        const actions=c.el('div','mg-actions');
        if(admin(c) && !item.removedAt) {
          actions.append(c.button('Edit',() => recordForm(c,root,'whitelist',view.load,item)));
          const remove=c.button('Remove',() => {
            if(!window.confirm(`Remove the local ban bypass for ${item.name}? Existing bans may apply in Protect mode.`)) return;
            c.action(remove,async () => { await c.api(`whitelist/${item.id}/remove`,{}); await view.load(data.page); });
          }); actions.append(remove);
        }
        c.addRow(table.body,[link(c,`${item.name} · ${item.uid}`,() => identityDetail(c,root,item.uid)),item.reason,item.expiresAt?c.date(item.expiresAt):'No expiry',item.removedAt?'Removed':item.active?'Active':'Expired',actions]);
      }
      panel.append(table.wrap);
      if(!data.entries.length) panel.append(c.el('p','empty','No local bypass records match this search.'));
      return panel;
    });
    if(admin(c)) view.panel.append(c.button('Add local bypass',() => recordForm(c,root,'whitelist',view.load),'primary'));
    return view.load(1);
  }
  async function server(c,root) {
    const data=await c.api('server'), panel=c.card('Server overview',data.name || 'No server telemetry received');
    panel.append(pairs(c,{Status:data.online?'Online':'Offline / awaiting telemetry',Mode:data.mode || 'Not reported','Last received':c.date(data.lastSeen),'Resource version':data.resourceVersion || data.version || 'Not reported','Observed uptime':Number.isFinite(data.uptime)?`${Math.floor(data.uptime/60)} minutes`:'Not reported','Players online':data.online?c.number(data.players?.length):'Not available'}));
    const resources=c.card('Server resources','Latest resource-reported state'), form=c.el('form','mg-search'), query=c.input('mg-resource-search'), result=c.el('div');
    const submit=c.button('Search',() => {}); submit.type='submit';
    const sort=c.select('mg-resource-sort',[['name','Name A–Z'],['state','State A–Z']]);let limit=25;
    const rows=()=>{const q=query.value.trim().toLowerCase();return (data.resources||[]).filter(item=>`${item.name} ${item.state}`.toLowerCase().includes(q)).sort((a,b)=>String(a[sort.value]).localeCompare(String(b[sort.value]))||a.name.localeCompare(b.name));};
    form.append(c.field('Resource name or state',query),c.field('Sort',sort),submit);
    const refresh=c.button('Refresh',()=>c.action(refresh,async()=>{const updated=c.el('div');await server(c,updated);if(c.isCurrent())root.replaceChildren(...updated.childNodes);}));
    const exportData=c.button('Export resources JSON',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify({server:data.name,lastSeen:data.lastSeen,resourceVersion:data.resourceVersion,resources:rows()},null,2)],{type:'application/json'}));
      download(c,'server-resources.json',url);setTimeout(()=>URL.revokeObjectURL(url),1000);
    });form.append(refresh,exportData);
    const draw=(page,size=limit)=>{
      limit=size;const matches=rows();
      const table=c.tableShell(['Resource','State']);
      for(const item of matches.slice((page-1)*limit,page*limit)) c.addRow(table.body,[item.name,item.state]);
      const pagination={page,limit,total:matches.length};
      result.replaceChildren(pager(c,pagination,draw),table.wrap,pager(c,pagination,draw));
      if(!matches.length) result.prepend(c.el('p','empty','No resource inventory matches this search.'));
    };
    form.addEventListener('submit',event => {event.preventDefault();draw(1);});
    sort.addEventListener('change',()=>draw(1));
    resources.append(form,result); draw(1);
    root.append(panel,resources);
    panel.append(pairs(c,{'Server session':data.sessionId||'Not reported'}));
    const capabilities=c.el('details');capabilities.append(c.el('summary','','Reported capabilities'),c.el('pre','mg-evidence',JSON.stringify(data.capabilities||{},null,2)));panel.append(capabilities);
    panel.append(c.el('p','mg-note','License-authorised IP management and vendor downloads are unavailable on this self-hosted server. Resource versions beyond the guard version are not reported.'));
  }
  async function storage(c,root) {
    const panel=c.card('Stored captures','Local JPEG evidence · permanent captures stay pinned until explicitly unpinned'), totals=c.el('div');
    const form=c.el('form','mg-search'), query=c.input('mg-media-search'), result=c.el('div');
    const search=c.button('Search',() => {}); search.type='submit';
    const retention=c.select('mg-retention',[['all','All'],['permanent','Permanent'],['deletable','Deletable']]);
    const type=c.select('mg-media-type',[['all','All types'],['images','Images']]);let limit=25,request=0,current=1;
    form.append(c.field('Player or capture ID',query),c.field('Retention',retention),c.field('Type',type),search,c.button('Refresh',()=>draw(current)));
    const draw=async(page,size=limit)=>{
      limit=size;current=page;const version=++request;
      try{
      const data=await c.api(`protection/media?q=${encodeURIComponent(query.value)}&retention=${retention.value}&type=${type.value}&offset=${(page-1)*limit}&limit=${limit}`);
      if(version!==request||!c.isCurrent())return;
      if(page>1&&!data.media.length)return draw(Math.max(1,Math.ceil(data.count/limit)));
      const table=c.tableShell(['Capture','Player','Created','Size','Retention','Actions']);
      for(const item of data.media) {
        const actions=c.el('div','mg-actions'), preview=c.button('View',() => c.action(preview,async () => {
          const media=await c.api(`protection/media/${item.id}`);
          if(!c.isCurrent()) return;
          const dialog=modal(c,root,`Capture #${item.id}`), image=c.el('img','mg-capture');
          image.alt=`Stored screenshot of ${item.playerName} at ${c.date(item.createdAt)}`; image.src=media.image;
          dialog.append(image,pairs(c,{Player:item.playerName,Captured:c.date(item.createdAt),'Command ID':item.commandId})); dialog.showModal();
        })); actions.append(preview);
        const saveImage=c.button('Download',()=>c.action(saveImage,async()=>{
          const media=await c.api(`protection/media/${item.id}`);
          if(typeof media.image!=='string'||!media.image.startsWith('data:image/jpeg;base64,'))throw new Error('Unsupported capture format.');
          download(c,`capture-${item.id}.jpg`,media.image);
        }));actions.append(saveImage,copy(c,'Copy capture ID',item.id));
        if(admin(c,'players')) {
          const pin=c.button(item.pinned?'Unpin':'Pin permanently',()=>{
            if(item.pinned&&!window.confirm(`Unpin capture #${item.id}? It will become deletable.`))return;
            c.action(pin,async()=>{await c.api(`protection/media/${item.id}/pin`,{pinned:!item.pinned});await draw(page);});
          });actions.append(pin);
          const remove=c.button('Delete',() => {
            if(!window.confirm(`Permanently delete stored capture #${item.id}?`)) return;
            c.action(remove,async () => {await c.api(`protection/media/${item.id}/remove`,{});await draw(page);});
          });remove.disabled=!!item.pinned;remove.title=item.pinned?'Unpin before deleting':'';actions.append(remove);
        }
        c.addRow(table.body,[item.id,item.playerName||`Player ${item.playerId}`,c.date(item.createdAt),`${c.number(Math.ceil(item.bytes/1024))} KB`,item.pinned?'Permanent':'Deletable',actions]);
      }
      const pagination={page,limit,total:data.count};
      result.replaceChildren(pager(c,pagination,draw),table.wrap,pager(c,pagination,draw));
      totals.replaceChildren(pairs(c,{'Matching captures':c.number(data.count),'Stored bytes':c.number(data.totalBytes)}));
      if(!data.media.length)result.prepend(c.el('p','empty','No stored captures match these filters. Request a screenshot from Streams.'));
      }catch(error){if(version===request)c.notice(error.message);}
    };
    form.addEventListener('submit',event => {event.preventDefault();draw(1);});
    retention.addEventListener('change',()=>draw(1));type.addEventListener('change',()=>draw(1));
    panel.append(totals,form,c.el('p','mg-note','Video capture is unavailable. This server stores JPEG screenshots only.'),result);
    root.append(panel);await draw(1);
  }
  return {async render(page,c) {
    if(!pages.has(page)) return null;
    const root=c.el('div','mg-page');
    await ({server,storage,identities,threats,whitelist}[page])(c,root);
    return root;
  }};
})();
