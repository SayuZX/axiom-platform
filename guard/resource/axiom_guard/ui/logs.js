window.GuardLogs=(()=>{
  const pages=new Set(['detections','events','logs','log-stats','audit']);
  const presets=['1h','24h','7d','30d','90d','all','custom'];
  function control(c,label,run){const b=c.button(label,()=>c.action(b,run));return b;}
  function download(data){const href=URL.createObjectURL(new Blob([data.content],{type:data.mime})),a=document.createElement('a');a.href=href;a.download=data.filename;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
  async function render(page,c){
    if(!pages.has(page))return null;
    const root=c.el('div','lg-page'),isAudit=page==='audit',isStats=page==='log-stats';
    const writable=c.getUser()?.role!=='viewer',options=await c.api('logs/options');
    const filters=c.card(isAudit?'Audit search':isStats?'Log statistics':'Logs viewer');
    const toolbar=c.el('div','lg-toolbar'),form=c.el('form','lg-filters'),output=c.el('div'),saved=c.el('div','lg-saved');
    const inputs={},add=(key,label,node)=>{inputs[key]=node;form.append(c.field(label,node));return node;};
    const preset=add('preset','Time range',c.select('lg-preset',presets.map(x=>[x,x==='all'?'All time':x==='custom'?'Custom dates':x])));preset.value='24h';
    const from=add('from','From (local time)',c.input('lg-from','datetime-local')),to=add('to','Until (local time)',c.input('lg-to','datetime-local'));from.step=to.step='1';
    const q=add('q','Keyword',c.input('lg-query'));q.maxLength=500;
    if(isAudit)add('action','Action',c.select('lg-action',[['','All actions'],...options.actions.map(x=>[x,x])]));
    else {
      add('kind','Type',c.select('lg-kind',[['','All types'],...options.kinds.map(x=>[x,x])]));
      add('severity','Severity',c.select('lg-severity',[['','All severities'],...options.severities.map(x=>[x,x])]));
      const field=add('filter','Field filters',c.input('lg-filter'));field.maxLength=2000;field.placeholder='kind=detection AND details.damage=500';
    }
    const sortOptions=isAudit?[['at','Date'],['action','Action']]:[['at','Date'],['kind','Type'],['player','Name'],['source','Source ID'],['license','License'],['rule','Rule'],['severity','Severity']];
    add('sort','Sort',c.select('lg-sort',sortOptions));
    add('direction','Direction',c.select('lg-direction',[['desc','Descending'],['asc','Ascending']]));
    add('limit','Rows per page',c.select('lg-limit',[['25','25'],['50','50'],['100','100']]));
    if(isStats)for(const key of ['sort','direction','limit'])inputs[key].parentElement.hidden=true;
    if(!isAudit){const link=c.el('a','lg-link',isStats?'Logs viewer':'Log stats');link.href=isStats?'#detections':'#log-stats';toolbar.append(link);}
    let currentPage=1,revision=0,applied;
    function params(){const result=new URLSearchParams();for(const [key,node] of Object.entries(inputs)){let value=node.value;if(key==='from'||key==='to'){if(preset.value!=='custom')continue;if(!value)throw Error('Choose both custom dates.');value=new Date(value).toISOString();}result.set(key,value);}return result;}
    function dateVisibility(){from.disabled=to.disabled=preset.value!=='custom';}
    preset.addEventListener('change',dateVisibility);dateVisibility();
    for(const value of presets.filter(x=>x!=='custom'))toolbar.append(control(c,value==='all'?'All time':value,async()=>{preset.value=value;dateVisibility();currentPage=1;await load();}));
    const apply=c.el('button','primary','Search');apply.type='submit';
    form.addEventListener('submit',event=>{event.preventDefault();currentPage=1;c.action(apply,load);});
    toolbar.append(control(c,'Refresh',load));form.append(apply);
    filters.append(toolbar,form);
    if(!isAudit)filters.append(c.el('p','lg-help','Supported filter subset (not full USQL): equality joined by uppercase AND. Fields: kind, rule, player (name or source ID), license (exact native license identifier), details.field or details.nested.field. Double-quote strings containing spaces; numbers, true, false and null are accepted. Equality is case-sensitive; keyword search is literal and case-insensitive. Date bounds are inclusive.'));
    root.append(filters,saved,output);
    const bookmark=c.select('lg-bookmark',[['','Saved queries']]),name=c.input('lg-bookmark-name','text');name.maxLength=80;name.placeholder='Bookmark name';
    saved.append(c.field('Saved queries',bookmark));
    let bookmarks=[];
    async function refreshBookmarks(){const data=await c.api('logs/bookmarks');bookmarks=data.bookmarks.filter(b=>isAudit?Object.hasOwn(b.filters,'action'):!Object.hasOwn(b.filters,'action'));bookmark.replaceChildren();for(const b of [{id:'',name:'Select saved query'},...bookmarks]){const o=c.el('option','',b.name);o.value=b.id;bookmark.append(o);}}
    saved.append(control(c,'Load query',async()=>{const b=bookmarks.find(x=>String(x.id)===bookmark.value);if(!b)throw Error('Select a saved query.');for(const [key,node] of Object.entries(inputs)){let value=b.filters[key]??({preset:'24h',sort:'at',direction:'desc',limit:'25'}[key]||'');if((key==='from'||key==='to')&&value){const d=new Date(value);value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19);}node.value=value;}dateVisibility();currentPage=1;await load();}));
    if(writable)saved.append(c.field('Bookmark name',name),control(c,'Save query',async()=>{await c.api('logs/bookmarks',{name:name.value,filters:Object.fromEntries(params())});name.value='';await refreshBookmarks();}),control(c,'Delete query',async()=>{if(!bookmark.value)throw Error('Select a saved query.');await c.api(`logs/bookmarks/${bookmark.value}/delete`,{});await refreshBookmarks();}));
    const exports=c.el('div','lg-toolbar');
    async function exported(format){const p=new URLSearchParams(applied||params());p.set('format',format);if(isAudit)p.set('type','audit');return c.api('logs/export?'+p);}
    for(const format of ['json','csv'])exports.append(control(c,'Export '+format.toUpperCase(),async()=>download(await exported(format))));
    exports.append(control(c,'Copy JSON',async()=>{const data=await exported('json');await navigator.clipboard.writeText(data.content);c.notice(`${data.count} log rows copied.`);}));
    filters.append(exports,c.el('p','lg-help','Exports include all matching rows, up to 10,000; narrow filters for larger selections. CSV neutralizes spreadsheet formulas.'));
    function chart(title,rows){const panel=c.card(title);if(!rows.length)panel.append(c.el('p','empty','No matching events.'));const max=Math.max(1,...rows.map(r=>r.count));for(const row of rows){const line=c.el('div','lg-chart-row'),label=c.el('span','',row.label||'(none)'),meter=c.el('meter');meter.min=0;meter.max=max;meter.value=row.count;meter.setAttribute('aria-label',`${row.label||'(none)'}: ${row.count}`);line.append(label,meter,c.el('strong','',c.number(row.count)));panel.append(line);}return panel;}
    function pager(data,suffix){const bar=c.el('div','lg-pager'),pages=Math.max(1,Math.ceil(data.total/data.limit)),pageInput=c.input('lg-page-'+suffix,'number');pageInput.min='1';pageInput.max=String(pages);pageInput.value=String(data.page);
      const previous=control(c,'Previous',async()=>{currentPage--;await load(false);}),next=control(c,'Next',async()=>{currentPage++;await load(false);});previous.disabled=data.page<=1;next.disabled=data.page>=pages;
      const go=control(c,'Go',async()=>{const n=Number(pageInput.value);if(!Number.isSafeInteger(n)||n<1||n>pages)throw Error(`Choose a page from 1 to ${pages}.`);currentPage=n;await load(false);});
      bar.append(c.el('span','',`${c.number(data.total)} rows · page ${data.page} of ${pages}`),previous,c.field('Page',pageInput),go,next);return bar;}
    async function evidence(id){const {event}=await c.api(`logs/events/${id}`);c.details('Event evidence',{Date:c.date(event.at),Type:event.kind,Player:event.playerName,Source:event.playerId,Rule:event.rule,Severity:event.severity,Reviewed:event.reviewed?'Yes':'No'},event.details);}
    async function load(reset=true){
      const version=++revision,p=reset||!applied?params():new URLSearchParams(applied);p.set('page',currentPage);
      const data=await c.api(`logs/${isAudit?'audit':isStats?'stats':'events'}?${p}`);
      if(version!==revision)return;
      if(!isStats&&currentPage>Math.max(1,Math.ceil(data.total/data.limit))){currentPage=Math.max(1,Math.ceil(data.total/data.limit));return load(reset);}
      applied=new URLSearchParams(p);if(data.bounds.from){applied.set('preset','custom');applied.set('from',data.bounds.from);applied.set('to',data.bounds.to);}
      output.replaceChildren();
      if(isStats){output.append(c.el('h2','',`${c.number(data.total)} matching events`));const charts=c.el('div','lg-charts');charts.append(chart('By type',data.byKind),chart('By rule',data.byRule),chart('By severity',data.bySeverity),chart(`Timeline (${data.bucket} buckets; nonempty buckets shown)`,data.timeline));output.append(charts);return;}
      output.append(pager(data,'top'));
      const table=c.tableShell(isAudit?['Date','Action','Details']:['Date','Type','Name','Source','License','Rule','Severity','Data / review']);
      for(const row of data.rows){const actions=c.el('div','lg-row-actions');
        if(isAudit){actions.append(control(c,'View details',()=>c.details('Audit entry',{Date:c.date(row.at),Action:row.action},row.details)));c.addRow(table.body,[c.date(row.at),row.action,actions]);}
        else {const license=row.details.license||(Array.isArray(row.details.identifiers)?row.details.identifiers.find(id=>typeof id==='string'&&id.startsWith('license:')):null);
          actions.append(control(c,'Evidence',()=>evidence(row.id)));
          if(writable)actions.append(control(c,row.reviewed?'Mark unreviewed':'Mark reviewed',async()=>{await c.api(`events/${row.id}/review`,{reviewed:!row.reviewed});await load(false);}));
          else actions.append(c.el('span','',row.reviewed?'Reviewed':'Unreviewed'));
          c.addRow(table.body,[c.date(row.at),row.kind,row.playerName,row.playerId,license,row.rule,row.severity,actions]);
        }
      }
      if(!data.rows.length)output.append(c.el('p','empty','No matching logs.'));
      output.append(table.wrap,pager(data,'bottom'));
    }
    for(const key of ['sort','direction','limit'])inputs[key].addEventListener('change',()=>{currentPage=1;c.action(inputs[key],load);});
    await Promise.all([refreshBookmarks(),load()]);return root;
  }
  return {render};
})();
