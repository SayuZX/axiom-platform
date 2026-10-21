window.GuardDrains=(()=>{
  async function render(page,c){
    if(page!=='event-drains')return null;
    const root=c.el('div','drains-page'),user=c.getUser();
    const writable=['owner','admin'].includes(user?.role)&&(user.role==='owner'||(user.permissions??[]).includes('automation'));
    const controls=c.card('Event drains'),editor=c.el('div'),secrets=c.el('div'),output=c.el('div'),history=c.el('div');
    const search=c.input('drain-search');search.placeholder='Search drains';
    const toolbar=c.el('div','drains-actions');
    const run=(label,fn)=>{const b=c.button(label,()=>c.action(b,fn));return b;};
    let drains=[],editing=null,selected=null;
    function reveal(secret){
      secrets.replaceChildren();
      if(!secret)return;
      const panel=c.card('Signing key — shown once'),key=c.input('drain-secret','text');key.value=secret;key.readOnly=true;key.autocomplete='off';key.spellcheck=false;
      panel.append(c.el('p','','Store this key securely. It cannot be retrieved again; rotate it if lost.'),c.field('32-byte signing key (hex)',key),c.button('Dismiss key',()=>{key.value='';secrets.replaceChildren();}));secrets.append(panel);
    }
    root.append(controls,secrets,editor,output,history);

    function showHistory(){
      history.replaceChildren();const drain=drains.find(d=>d.id===selected);if(!drain)return;
      const panel=c.card(`Delivery history — ${drain.name}`),table=c.tableShell(['Time','Event key','Kind','Result','HTTP']);
      for(const item of drain.history)c.addRow(table.body,[c.date(item.at),item.eventKey,item.kind,item.status,item.httpStatus??'—']);
      panel.append(c.el('p','drains-help',`${drain.queued} queued; ${drain.delivering?'delivery in progress':'idle'}. Latest 100 results. Each event receives one attempt; redirects are never followed.`),table.wrap);
      if(!drain.history.length)panel.append(c.el('p','empty','No deliveries yet.'));
      history.append(panel);
    }
    async function load(){const data=await c.api('event-drains');drains=data.drains;paint();showHistory();}
    toolbar.append(c.field('Search',search),run('Refresh',load));
    controls.append(c.el('p','drains-help','Send selected events as signed JSON to your public HTTPS endpoint. 100 queued events and 100 delivery results per drain; deduplication remembers the latest 10,000 event keys. Saving configuration cancels queued events.'),toolbar);
    controls.append(c.el('p','drains-help','Verify X-Guard-Signature (sha256=hex) using HMAC-SHA256 with the hex-decoded signing key over X-Guard-Timestamp + "." + the exact request body. Timestamp is Unix seconds. Enforce freshness and deduplicate event.key at the receiver.'));
    function edit(drain){
      editing=drain?.id??null;editor.replaceChildren();
      const panel=c.card(drain?'Edit event drain':'Create event drain'),form=c.el('form','drains-form');
      const name=c.input('drain-name','text'),endpoint=c.input('drain-endpoint','url'),enabled=c.input('drain-enabled','checkbox');
      name.required=endpoint.required=true;name.maxLength=80;endpoint.maxLength=2048;endpoint.placeholder='https://receiver.your-domain.com/events';
      name.value=drain?.name??'';endpoint.value=drain?.endpoint??'';enabled.checked=drain?.enabled??true;
      form.append(c.field('Name',name),c.field('HTTPS destination',endpoint),c.field('Enabled',enabled));
      const kinds=c.el('fieldset','drains-kinds');kinds.append(c.el('legend','','Event kinds'));
      const choices=['detection','connection','disconnection','system'].map(kind=>{
        const input=c.input('drain-kind-'+kind,'checkbox');input.checked=(drain?.kinds??['detection']).includes(kind);kinds.append(c.field(kind,input));return {kind,input};
      });
      const save=c.el('button','primary',drain?'Save changes':'Create drain');save.type='submit';
      form.append(kinds,save,c.button('Cancel',()=>{editing=null;editor.replaceChildren();}));
      form.addEventListener('submit',event=>{event.preventDefault();c.action(save,async()=>{
        const selectedKinds=choices.filter(x=>x.input.checked).map(x=>x.kind);if(!selectedKinds.length)throw Error('Select at least one event kind.');
        if(!confirm(`${drain?'Save changes to':'Create'} ${name.value}? ${enabled.checked?'Selected event data will be sent to':'Disabled destination:'} ${endpoint.value}`))return;
        const result=await c.api('event-drains'+(drain?'/'+drain.id:''),{name:name.value,endpoint:endpoint.value,kinds:selectedKinds,enabled:enabled.checked,confirm:true});
        editing=null;editor.replaceChildren();reveal(result.secret);await load();
      });});
      panel.append(form);editor.append(panel);name.focus();
    }
    function paint(){
      output.replaceChildren();const table=c.tableShell(['Name / destination','Events','State','Queued','Signing key','Actions']);
      const q=search.value.trim().toLowerCase(),rows=drains.filter(d=>(d.name+' '+d.endpoint+' '+d.kinds.join(' ')).toLowerCase().includes(q));
      for(const drain of rows){
        const title=c.el('div','drains-destination'),actions=c.el('div','drains-actions');title.append(c.el('strong','',drain.name),c.el('span','',drain.endpoint));
        actions.append(c.button('History',()=>{selected=drain.id;showHistory();}));
        if(writable)actions.append(c.button('Edit',()=>edit(drain)),
          run(drain.enabled?'Disable':'Enable',async()=>{if(!confirm(`${drain.enabled?'Disable':'Enable'} ${drain.name}? Queued events will be cancelled.`))return;await c.api(`event-drains/${drain.id}`,{enabled:!drain.enabled,confirm:true});await load();}),
          run('Test',async()=>{if(!confirm(`Send one signed synthetic system event to ${drain.endpoint}? This contacts the destination even when disabled.`))return;const result=await c.api(`event-drains/${drain.id}/test`,{confirm:true});selected=drain.id;await load();c.notice(`Test: ${result.delivery.status}${result.delivery.httpStatus?' (HTTP '+result.delivery.httpStatus+')':''}.`);}),
          run('Rotate key',async()=>{if(!confirm(`Rotate ${drain.name}'s signing key? The old key stops working immediately. Queued events will be cancelled.`))return;const result=await c.api(`event-drains/${drain.id}`,{rotate:true,confirm:true});reveal(result.secret);await load();}),
          run('Remove',async()=>{if(!confirm(`Remove ${drain.name}, its queue and delivery history?`))return;await c.api(`event-drains/${drain.id}/remove`,{confirm:true});if(editing===drain.id){editing=null;editor.replaceChildren();}await load();}));
        c.addRow(table.body,[title,drain.kinds.join(', '),drain.enabled?'Enabled':'Disabled',drain.queued,drain.signingKey,actions]);
      }
      output.append(table.wrap);if(!rows.length)output.append(c.el('p','empty','No matching event drains.'));
    }
    search.addEventListener('input',paint);
    if(writable)toolbar.append(c.button('Create drain',()=>edit(null),'primary'));
    await load();return root;
  }
  return {render};
})();