(() => {
  'use strict';
  let generation=0, timer=null, dialog=null;
  function dispose() { generation++;clearTimeout(timer);timer=null;dialog?.close();dialog=null; }
  const allowed=c=>['owner','admin'].includes(c.getUser()?.groupId);
  function confirm(c,action,target,serverSession,message) {
    return new Promise(resolve=>{
      dialog=document.getElementById('dialog');
      const modal=dialog,content=document.getElementById('dialog-content'),heading=c.el('h2','',`Confirm ${action}${target?` · ${target}`:''}`),description=c.el('p','',message);
      heading.id='dialog-title';description.id='rc-confirm-description';modal.setAttribute('aria-describedby',description.id);
      const details=c.el('p','muted',`FXServer session: ${serverSession}. This action executes immediately, including in monitor mode.`);
      let accepted=false;
      const submit=c.button(`Confirm ${action}`,()=>{accepted=true;modal.close();},'primary');
      content.replaceChildren(heading,description,details,submit);
      const cancel=document.getElementById('dialog-close');cancel.textContent='Cancel';
      modal.addEventListener('close',()=>{dialog=null;modal.removeAttribute('aria-describedby');resolve(accepted);},{once:true});
      modal.showModal();cancel.focus();
    });
  }
  async function render(page,c) {
    dispose();const token=generation,active=()=>token===generation&&(!c.isCurrent||c.isCurrent());
    const root=c.el('div','rc-page');
    if(!allowed(c)) {root.append(c.card('Resource administration','Only Owner and the built-in Administrator group can administer FXServer resources.'));return root;}
    const card=c.card('FXServer resources','Native txAdmin controls remain available when axiom_guard is stopped. Stopping AXIOM disables its protection; the external web dashboard is the recovery surface.');
    const historyCard=c.card('Resource command receipts','Queued transport is not success. Completion requires a fresh native state; restart / ensure-running also require a native start event. Unknown results must be inspected before retrying.');
    const filter=c.input('rc-filter','search'),states=c.select('rc-state',[['','All states'],['started','Started'],['stopped','Stopped'],['starting','Starting'],['stopping','Stopping'],['uninitialized','Uninitialized']]);
    filter.placeholder='Filter exact resource names';
    const controls=c.el('div','rc-controls'),status=c.el('p','muted'),rows=c.el('div'),history=c.el('div');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    let snapshot=null,pending=false,loading=false,commands=[];
    const run=fn=>Promise.resolve().then(fn).catch(error=>{if(active()){status.textContent=error.message;c.notice(error.message);}});
    const reload=c.button('Reload native state',()=>run(load));
    const refresh=c.button('Refresh resource manifests',()=>run(()=>send('refresh','')));
    controls.append(c.field('Resource name',filter),c.field('State',states),reload,refresh);
    card.append(controls,status,rows);historyCard.append(history);root.append(card,historyCard);
    function renderRows() {
      if(!snapshot)return;
      const table=c.tableShell(['Resource','Native state','Actions']);
      const query=filter.value.trim().toLowerCase();
      const visible=snapshot.resources.filter(resource=>resource.name.toLowerCase().includes(query)&&(!states.value||resource.state===states.value));
      for(const resource of visible) {
        const actions=c.el('div','rc-actions');
        if(resource.manageable) for(const action of ['start','stop','restart','ensure']) {
          const button=c.button(action[0].toUpperCase()+action.slice(1),()=>run(()=>send(action,resource.name)));
          button.disabled=pending;button.setAttribute('aria-label',`${action} ${resource.name}`);actions.append(button);
        } else actions.append(c.el('span','muted','Name is not safe for native command arguments.'));
        c.addRow(table.body,[resource.name,resource.state,actions]);
      }
      rows.replaceChildren(table.wrap);
      if(!visible.length)rows.append(c.el('p','empty','No resources match this filter.'));
      refresh.disabled=pending;reload.disabled=loading;
    }
    function renderHistory() {
      const table=c.tableShell(['Time','Operator','Action / target','Status','Native state','Receipt']);
      for(const command of commands) c.addRow(table.body,[c.date(command.createdAt),command.operator,`${command.action} ${command.target||'(all manifests)'}`,command.status,`${command.beforeState||'—'} / ${command.afterState||'—'}`,c.button('Details',()=>c.details('Resource command receipt',{'Command ID':command.id,Operator:command.operator,Action:command.action,Target:command.target||'All manifests','FXServer session':command.serverSession,Status:command.status,Result:command.message,Created:c.date(command.createdAt),Completed:command.completedAt?c.date(command.completedAt):'Awaiting native result'}))]);
      history.replaceChildren(table.wrap);
      if(!commands.length)history.append(c.el('p','empty','No resource commands submitted.'));
    }
    async function loadHistory() {
      const result=await c.api('resources/commands');if(!active())return;
      commands=result.commands;pending=commands.some(command=>command.status==='pending');renderHistory();renderRows();
      clearTimeout(timer);
      if(pending)timer=setTimeout(()=>run(async()=>{await loadHistory();if(!pending)await load();}),1500);
    }
    async function load() {
      if(loading)return;
      loading=true;reload.disabled=true;
      try {
        const result=await c.api('resources');if(!active())return;
        snapshot=result;status.textContent=`${result.resources.length} resources · FXServer session ${result.serverSession} · observed ${c.date(result.observedAt)}`;renderRows();
      } finally {loading=false;if(active())reload.disabled=false;}
      if(active())await loadHistory();
    }
    async function send(action,target) {
      if(pending||!snapshot)return;
      const frozenSession=snapshot.serverSession;
      const resource=snapshot.resources.find(item=>item.name===target);
      const message=action==='refresh'?'Refresh all installed resource manifests. This discovers added resources but does not start them.':resource?.warning||'This can interrupt connected players and dependent resources.';
      if(!await confirm(c,action,target,frozenSession,message)||!active())return;
      pending=true;renderRows();status.textContent=`Submitting ${action} ${target}…`;
      try {
        const {command}=await c.api('resources/commands',{action,target,serverSession:frozenSession,confirmed:true});if(!active())return;
        status.textContent=`${command.action} ${command.target}: ${command.status}. Awaiting native state, not transport acknowledgement.`;
        await loadHistory();
      } catch(error) {
        if(active()){pending=false;renderRows();await loadHistory().catch(()=>{});}
        throw error;
      }
    }
    filter.addEventListener('input',renderRows);states.addEventListener('change',renderRows);
    await run(async()=>{await loadHistory();await load();});return root;
  }
  window.GuardResourceControl={render,dispose};
})();
