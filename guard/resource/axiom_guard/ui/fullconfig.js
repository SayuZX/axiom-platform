window.GuardFullConfig=(()=>{
 let dirty=false;const hasDirty=()=>dirty;
 async function render(page,c){
  const data=await c.api('fullconfig'),values=structuredClone(data.values),changes={};dirty=false;
  const root=c.el('div','fc-page'),panel=c.card('',''),tabs=c.el('div','config-tabs'),rows=c.el('div','fc-rows');
  panel.querySelector('.section-head').remove();
  let activeTab=data.catalog.tabs[0].id;const editable=c.getUser().role==='owner'||(c.getUser().permissions||[]).includes('config');
  const tools=c.el('div','fc-tools'),search=c.input('fc-search','search'),status=c.el('span','small','Configuration revision '+data.revision);
  search.placeholder='Search all '+data.catalog.tabs.reduce((n,t)=>n+t.fields.length,0)+' controls…';tools.append(c.field('Search configurations',search),status);
  function changed(f,value){values[f.key]=value;changes[f.key]=value;dirty=true;status.textContent='Unsaved changes';}
  function showHelp(f){c.details(f.label,{Implementation:f.unavailable?'External prerequisite unavailable':'AXIOM standalone',Scope:f.scope||'Configuration',Actions:f.actions?.join(', ')||'Not a detection action'},f.unavailable||f.description||'Protect applies configured actions. Client evidence can be forged or suppressed; kick/ban on client heuristics is an explicit policy choice. Monitor never changes gameplay.');}
  function editor(f,expanded=false){
   const box=c.el('div','fc-value'),value=values[f.key],locked=!editable||!!f.unavailable;
   if(f.type==='boolean'){
    const b=c.button('',()=>{changed(f,!values[f.key]);b.setAttribute('aria-checked',String(values[f.key]));},'fc-switch');b.setAttribute('role','switch');b.setAttribute('aria-label',f.label);b.setAttribute('aria-checked',String(value));b.disabled=locked;box.append(b);
   }else if(f.type==='array'){
    const chips=c.el('div','fc-chips'),add=c.input('fc-array-'+data.catalog.tabs.flatMap(t=>t.fields).indexOf(f),'text');add.placeholder='New item, press enter to add…';add.disabled=locked;add.setAttribute('aria-label','Add '+f.label);
    const draw=()=>{chips.replaceChildren();for(const entry of values[f.key]){const chip=c.el('span','fc-chip');const remove=c.button('×',()=>{changed(f,values[f.key].filter(v=>v!==entry));draw();},'');remove.setAttribute('aria-label','Remove '+entry+' from '+f.label);remove.disabled=locked;chip.append(c.el('span','',entry),remove);chips.append(chip);}};
    add.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const item=add.value.trim();if(item&&!values[f.key].includes(item)){changed(f,[...values[f.key],item]);draw();}add.value='';}});draw();box.append(chips,add);
   }
   else if(f.key==='Detection settings'){
    const table=c.tableShell(['Detection','Enabled','Action']);
    for(const entry of data.catalog.tabs.flatMap(t=>t.fields).filter(x=>x.actions)){
     const item=value[entry.key]||{enabled:values[entry.key]!==false,action:entry.defaultAction};
     const enabled=c.input('fc-detection-'+entry.key,'checkbox');enabled.checked=item.enabled;enabled.disabled=locked;enabled.setAttribute('aria-label','Enable '+entry.key);
     const action=c.select('fc-action-'+entry.key,entry.actions.map(x=>[x,x]));action.value=item.action;action.disabled=locked;action.setAttribute('aria-label','Action for '+entry.key);
     const update=()=>changed(f,{...values[f.key],[entry.key]:{enabled:enabled.checked,action:action.value}});enabled.addEventListener('change',update);action.addEventListener('change',update);c.addRow(table.body,[entry.label,enabled,action]);
    }box.append(table.wrap);
   }else if(f.type==='object'){
    const area=c.el('textarea','fc-json');area.rows=expanded?16:3;area.value=JSON.stringify(value,null,2);area.disabled=locked;area.setAttribute('aria-label',f.label);
    area.addEventListener('change',()=>{try{const parsed=JSON.parse(area.value);changed(f,parsed);area.setCustomValidity('');}catch{area.setCustomValidity('Enter valid JSON');area.reportValidity();}});box.append(area);
   }else{
    const node=f.type==='select'?c.select('fc-'+f.key,f.options.map(v=>[v,v])):c.input('fc-'+f.key,f.type==='number'?'number':'text');
    node.value=value??'';node.disabled=locked;node.setAttribute('aria-label',f.label);
    if(f.type==='number'){node.min=f.min;node.max=f.max;node.step=f.step;}
    node.addEventListener('change',()=>changed(f,f.type==='number'?Number(node.value):node.value));box.append(node);
   }
   return box;
  }
  function expand(f){
   const dialog=c.el('dialog','fc-dialog'),heading=c.el('h2','',f.label);heading.id='fc-expanded-title';dialog.setAttribute('aria-labelledby',heading.id);
   const close=c.button('Close',()=>dialog.close()),reset=c.button('Reset to Default',()=>{changed(f,structuredClone(f.default));fieldBox.replaceChildren(editor(f,true));draw();});reset.disabled=!editable||!!f.unavailable;
   const fieldBox=c.el('div');fieldBox.append(editor(f,true));dialog.append(heading,c.el('p','',f.unavailable||'Changes remain a draft until Save changes on the configuration page.'),fieldBox,reset,close);root.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();draw();},{once:true});dialog.showModal();close.focus();
  }
  function draw(){
   rows.replaceChildren();const query=search.value.trim().toLowerCase();
   const current=data.catalog.tabs.find(t=>t.id===activeTab);document.getElementById('page-title').textContent='Configs / '+(query?'Search':current.label);document.title='Configs / '+current.label+' · AXIOM GUARD';
   for(const tab of data.catalog.tabs){if(!query&&tab.id!==activeTab)continue;
    for(const f of tab.fields){if(query&&!f.label.toLowerCase().includes(query))continue;
     const row=c.el('div','fc-row'),label=c.el('div','fc-label',f.label),help=c.button('?',()=>showHelp(f),'fc-help');help.setAttribute('aria-label','About '+f.label);label.append(help);
     if(f.unavailable)label.append(c.el('small','fc-unavailable',f.unavailable));
     const more=c.button('⛶',()=>expand(f),'fc-expand');more.setAttribute('aria-label','Expand '+f.label);row.append(label,editor(f),more);rows.append(row);
    }
   }
   if(!rows.childElementCount)rows.append(c.el('p','empty','No matching controls.'));
  }
  for(const tab of data.catalog.tabs){const b=c.button(tab.label,()=>{activeTab=tab.id;search.value='';for(const t of tabs.children)t.setAttribute('aria-selected',String(t===b));draw();},'');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(activeTab===tab.id));tabs.append(b);}tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Configuration categories');
  search.addEventListener('input',draw);
  const actions=c.el('div','actions'),mode=c.select('fc-mode',[['monitor','Monitor'],['protect','Protect']]);mode.value=data.mode;mode.disabled=!editable;
  const save=c.button('Save changes',()=>c.action(save,async()=>{
   if(!root.querySelectorAll(':invalid').length){
    const confirmed=mode.value!=='protect'||window.confirm('Apply Protect? Enabled rules can change gameplay, cancel events, kick or ban. Client heuristics may match legitimate scripts; configure exemptions before punishment.');if(!confirmed)return;
    const response=await c.api('fullconfig',{revision:data.revision,changes,mode:mode.value,confirmProtect:mode.value==='protect'});data.revision=response.revision;data.values=structuredClone(response.values);data.mode=response.mode;for(const key of Object.keys(changes))delete changes[key];dirty=false;status.textContent='Saved revision '+data.revision;c.notice('Configuration saved; resource applies it on its next heartbeat.');
   }else root.querySelector(':invalid').reportValidity();
  }),'primary');save.disabled=!editable;
  const reset=c.button('Reset category',()=>{if(!window.confirm('Reset this category to AXIOM defaults? Save is required to apply.'))return;for(const f of data.catalog.tabs.find(t=>t.id===activeTab).fields)if(!f.unavailable)changed(f,structuredClone(f.default));draw();});reset.disabled=!editable;
  const discard=c.button('Discard changes',()=>{for(const k of Object.keys(changes))delete changes[k];Object.assign(values,structuredClone(data.values));mode.value=data.mode;dirty=false;status.textContent='Draft discarded';draw();});
  mode.addEventListener('change',()=>{dirty=true;status.textContent='Unsaved mode';});
  actions.append(c.field('Enforcement mode',mode),save,discard,reset);panel.append(tabs,tools,rows,actions);root.append(panel);draw();return root;
 }
 return {render,hasDirty,discard:()=>{dirty=false;}};
})();
