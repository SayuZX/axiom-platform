window.GuardAutomation = (() => {
  async function render(page,c,filters={range:'all',triggerId:''}) {
    const root=c.el('div','automation-page');
    const user=c.getUser(),canWrite=user?.role==='owner'||(user?.permissions??[]).includes('automation');
    const owned=c.getUser()?.role==='owner';
    const {el,card,field,input,select,api,addRow,tableShell,date,number}=c;
    const empty=(node,text)=>node.append(el('p','empty',text));
    const actions=()=>el('div','automation-actions');
    const run=(label,task,style='subtle')=>{const b=c.button(label,()=>c.action(b,task),style);return b;};
    const refresh=async()=>{const next=await render(page,c,filters);if(c.isCurrent()&&root.isConnected)root.replaceWith(next);};
    const textInput=(id,value='')=>{const n=input(`automation-${id}`,'text');n.value=value;return n;};
    const enabledInput=(id,value=true)=>{const n=input(`automation-${id}`,'checkbox');n.checked=value;return n;};
    const table=(parent,headers,rows)=>{
      if(!rows.length){empty(parent,'No records yet.');return;}
      const controls=el('div','automation-filters'),search=input(`automation-search-${page}-${headers[0]}`,'search');search.placeholder='Search records';
      const sort=select(`automation-sort-${page}-${headers[0]}`,[['','Original order'],...headers.flatMap((h,i)=>['Actions','Details'].includes(h)?[]:[[`${i}:asc`,`${h}: ascending`],[`${i}:desc`,`${h}: descending`]])]);
      controls.append(field('Search',search),field('Sort',sort));
      const t=tableShell(headers),value=v=>v instanceof Node?v.textContent:String(v??'');
      const draw=()=>{t.body.replaceChildren();let shown=rows.filter(row=>row.some(v=>value(v).toLowerCase().includes(search.value.toLowerCase())));if(sort.value){const [index,direction]=sort.value.split(':');shown.sort((a,b)=>value(a[index]).localeCompare(value(b[index]),undefined,{numeric:true})*(direction==='asc'?1:-1));}shown.forEach(row=>addRow(t.body,row));if(!shown.length)addRow(t.body,headers.map((_,i)=>i?'':'No matching records.'));};
      search.addEventListener('input',draw);sort.addEventListener('change',draw);draw();parent.append(controls,t.wrap);
    };
    const form=(parent,title,submit)=>{
      const panel=card(title),node=el('form','automation-form'),save=c.button('Save',()=>{},'primary');save.type='submit';
      node.addEventListener('submit',event=>{event.preventDefault();c.action(save,()=>submit(node));});
      panel.append(node);parent.append(panel);return {panel,node,save};
    };
    function accountForm(title,label,submit){
      const dialog=el('dialog','automation-dialog'),heading=el('h2','',title),node=el('form','automation-form');
      const error=el('p','automation-form-error'),controls=actions(),save=el('button','primary',label),opener=document.activeElement;
      const cancel=c.button('Cancel',()=>dialog.close());let pending=false;
      heading.id=`automation-${page}-dialog-title`;dialog.setAttribute('aria-labelledby',heading.id);
      error.setAttribute('role','alert');error.hidden=true;save.type='submit';node.noValidate=true;
      controls.append(cancel,save);dialog.append(heading,node);
      node.addEventListener('submit',async event=>{
        event.preventDefault();if(pending||!node.reportValidity())return;
        pending=true;save.disabled=true;cancel.disabled=true;save.textContent='Saving…';error.hidden=true;
        try{
          const message=await submit(node);dialog.close();
          if(c.isCurrent()){await refresh();if(message)c.notice(message);}
        }catch(failure){
          if(dialog.open){error.textContent=failure.message||'Unable to save. Try again.';error.hidden=false;error.scrollIntoView({block:'nearest'});}
          else if(c.isCurrent())c.notice(`Saved, but the list could not refresh: ${failure.message||'Reload the page.'}`);
        }finally{pending=false;save.disabled=false;cancel.disabled=false;save.textContent=label;}
      });
      dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
      dialog.addEventListener('close',()=>{dialog.remove();if(opener?.isConnected)opener.focus();},{once:true});
      return {node,open:()=>{node.append(error,controls);root.append(dialog);dialog.showModal();node.querySelector('input,select')?.focus();}};
    }
    if(page==='groups') {
      const data=await api('groups');
      const panel=card('Groups','Built-in groups are read-only. Only the owner can manage custom permissions.');root.append(panel);
      function edit(group) {
        const name=textInput('group-name',group?.name);name.required=true;name.maxLength=80;
        const checks=data.permissionKeys.map(key=>[key,enabledInput(`permission-${key}`,group?group.permissions.includes(key):key==='read')]);
        const f=accountForm(group?'Edit group':'Create group',group?'Save changes':'Create group',async()=>{
          const result=await api(group?`groups/${group.id}`:'groups',{name:name.value,permissions:checks.filter(([,node])=>node.checked).map(([key])=>key)});
          return group?`Group ${name.value.trim()} updated.`:`Group ${result.group.name} created. Select it when creating a user.`;
        });
        f.node.append(field('Name',name));
        const permissions=el('fieldset','automation-permissions');permissions.append(el('legend','','Permissions'));
        checks.forEach(([key,node])=>permissions.append(field(key,node)));f.node.append(permissions);f.open();
      }
      table(panel,['Name','Permissions','Type','Actions'],data.groups.map(group=>{
        const controls=actions();if(owned&&!group.builtin)controls.append(c.button('Edit',()=>edit(group)),run('Remove',async()=>{if(!confirm(`Remove ${group.name}? Assigned users must be moved first.`))return;await api(`groups/${group.id}/remove`,{});await refresh();}));
        return [group.name,group.permissions.join(', ')||'No access',group.builtin?'Built-in':'Custom',controls];
      }));
      if(owned)panel.append(c.button('Create group',()=>edit(null),'primary'));return root;
    }
    if(page==='users') {
      if(!owned){root.append(card('Users','Only the owner can view accounts or manage passwords.'));return root;}
      const [data,groups]=await Promise.all([api('users'),api('groups')]);
      const choices=groups.groups.filter(g=>g.id!=='owner').map(g=>[g.id,g.name]);
      const panel=card('Users','Each account signs in with a unique password. Share it securely; no email invitation is sent.');root.append(panel);
      table(panel,['Name','Group','Created','Status','Actions'],data.users.map(u=>{
        const controls=actions();
        if(u.role!=='owner')controls.append(c.button('Edit',()=>edit(u)));
        if(!u.revokedAt){
          controls.append(c.button('Reset password',()=>resetPassword(u)));
          if(u.role!=='owner')controls.append(run('Revoke',async()=>{if(!confirm(`Revoke access for ${u.name}? Active sessions will stop working.`))return;await api(`users/${u.id}/revoke`,{});await refresh();}));
        }
        return [u.name,groups.groups.find(g=>g.id===u.groupId)?.name??u.groupId,date(u.createdAt),u.revokedAt?'Revoked':u.passwordSet?'Active':'Needs password',controls];
      }));
      function passwordFields(node) {
        const password=input('automation-user-password','password'),confirmation=input('automation-user-password-confirm','password');
        for(const control of [password,confirmation]){control.name=control.id;control.autocomplete='new-password';control.required=true;control.minLength=8;control.maxLength=128;}
        const validate=()=>confirmation.setCustomValidity(password.value===confirmation.value?'':'Passwords do not match.');
        password.addEventListener('input',validate);confirmation.addEventListener('input',validate);
        node.append(field('Password',password),field('Confirm password',confirmation),el('p','muted small','Use 8–128 characters. Passwords are case-sensitive; spaces are preserved.'));
        return {password,confirmation,valid:()=>{validate();return node.reportValidity();}};
      }
      function edit(existing) {
        const name=textInput('user-name',existing?.name),role=select('automation-user-group',choices);name.required=true;name.maxLength=80;role.required=true;role.value=existing?.groupId??'viewer';
        let credentials;
        const create=accountForm(existing?'Edit user':'Create user',existing?'Save changes':'Create user',async()=>{
          if(credentials&&!credentials.valid())throw new Error('Check the password fields.');
          const result=await api(existing?`users/${existing.id}`:'users',{name:name.value,groupId:role.value,...(credentials?{password:credentials.password.value}:{})});
          if(credentials){credentials.password.value='';credentials.confirmation.value='';}
          return `User ${result.user.name} ${existing?'updated':'created'}.`;
        });
        create.node.append(field('Name',name),field('Group',role));
        if(!existing)credentials=passwordFields(create.node);
        create.open();
      }
      function resetPassword(account) {
        const own=account.id===c.getUser().id;
        const reset=accountForm(`Reset password: ${account.name}`,'Reset password',async()=>{
          if(!credentials.valid())throw new Error('Check the password fields.');
          if(!confirm(`Reset the password for ${account.name}? All sessions for this account will end immediately.${own?' You will be signed out and must sign in with the new password.':''}`))throw new Error('Password reset canceled.');
          await api(`users/${account.id}/password`,{password:credentials.password.value});
          credentials.password.value='';credentials.confirmation.value='';
          if(own){c.signedOut('Password changed. All your sessions ended. Sign in with your new password.');return;}
          return `Password changed for ${account.name}. All sessions for this account ended.`;
        });
        reset.node.append(el('p','muted',`Resetting the password ends all sessions for this account.${own?' This includes your current session.':''}`));
        const credentials=passwordFields(reset.node);reset.open();
      }
      panel.append(c.button('Create user',()=>edit(null),'primary'));return root;
    }
    if(page==='webhooks') {
      const data=await api('webhooks');
      const panel=card('Webhooks','Discord HTTPS endpoints only. Select categories for automatic logging; no trigger required. No categories means explicit triggers/tests only. Tokens stay hidden.');root.append(panel);
      const editor=el('div');
      function edit(hook) {
        editor.replaceChildren();
        const name=textInput('hook-name',hook?.name),url=input('automation-hook-url','url'),enabled=enabledInput('hook-enabled',hook?.enabled??true);
        name.required=true;name.maxLength=80;url.required=!hook;url.autocomplete='off';url.placeholder=hook?'Leave blank to retain endpoint':'https://discord.com/api/webhooks/…';
        const kinds=['connection','disconnection','detection','system'].map(kind=>[kind,enabledInput(`hook-kind-${kind}`,hook?.eventKinds?.includes(kind)??false)]);
        const f=form(editor,hook?'Edit webhook':'Create webhook',async()=>{
          await api(hook?`webhooks/${hook.id}`:'webhooks',{name:name.value,url:url.value,enabled:enabled.checked,eventKinds:kinds.filter(([,node])=>node.checked).map(([kind])=>kind)});url.value='';await refresh();
        });
        const categories=el('fieldset','automation-permissions');categories.append(el('legend','','Automatic logging categories'));
        kinds.forEach(([kind,node])=>categories.append(field(kind[0].toUpperCase()+kind.slice(1),node)));
        f.node.append(field('Name',name),field('Discord webhook URL',url),field('Enabled',enabled),categories,f.save);
      }
      table(panel,['Name','Endpoint','Automatic logs','Status','Actions'],data.webhooks.map(h=>{
        const controls=actions();if(canWrite)controls.append(c.button('Edit',()=>edit(h)),run('Send test',async()=>{
          if(!confirm(`Send a real test message to ${h.name}?`))return;
          await api(`webhooks/${h.id}/test`,{});c.notice('Test queued. See Trigger Debug for delivery status.');
        }),run('Remove',async()=>{if(!confirm(`Remove ${h.name}?`))return;await api(`webhooks/${h.id}/remove`,{});await refresh();}));
        return [h.name,h.endpoint,h.eventKinds.join(', ')||'Explicit triggers/tests only',h.enabled?'Enabled':'Disabled',controls];
      }));
      if(canWrite){panel.append(c.button('Create webhook',()=>edit(null),'primary'));root.append(editor);edit(null);}return root;
    }
    if(page==='triggers') {
      const [data,hooks]=await Promise.all([api('triggers'),api('webhooks')]);
      const panel=card('Triggers','Match real connection, disconnection or detection events. Conditions use exact values; blank means any.');root.append(panel);
      const editor=el('div');
      function edit(trigger) {
        editor.replaceChildren();
        const name=textInput('trigger-name',trigger?.name),kind=select('automation-kind',[['detection','Detection'],['connection','Connection'],['disconnection','Disconnection']]);
        const rule=textInput('rule',trigger?.conditions.rule),uid=textInput('uid',trigger?.conditions.uid);
        const severity=select('automation-severity',[['','Any severity'],['info','Info'],['low','Low'],['medium','Medium'],['high','High']]);
        const action=select('automation-action',[['log','Record execution'],['webhook','Send Discord webhook']]);
        const hook=select('automation-webhook',[['','Select webhook'],...hooks.webhooks.map(h=>[String(h.id),`${h.name}${h.enabled?'':' (disabled)'}`])]);
        const enabled=enabledInput('trigger-enabled',trigger?.enabled??true);
        name.required=true;name.maxLength=80;rule.maxLength=160;uid.maxLength=160;
        kind.value=trigger?.kind??'detection';severity.value=trigger?.conditions.severity??'';action.value=trigger?.action??'log';hook.value=String(trigger?.webhookId??'');
        const hookField=field('Webhook',hook);
        const syncAction=()=>{hookField.hidden=action.value!=='webhook';hook.required=action.value==='webhook';};action.addEventListener('change',syncAction);syncAction();
        const f=form(editor,trigger?'Edit trigger':'Create trigger',async()=>{
          const conditions={};if(rule.value.trim())conditions.rule=rule.value.trim();if(uid.value.trim())conditions.uid=uid.value.trim();if(severity.value)conditions.severity=severity.value;
          await api(trigger?`triggers/${trigger.id}`:'triggers',{name:name.value,kind:kind.value,conditions,action:action.value,webhookId:hook.value?Number(hook.value):null,enabled:enabled.checked});await refresh();
        });
        f.node.append(field('Name',name),field('Event',kind),field('Rule (exact)',rule),field('Severity (exact)',severity),field('Player UID (license suffix)',uid),field('Action',action),hookField,field('Enabled',enabled),f.save);
      }
      table(panel,['Name','Event','Conditions','Action','Status','Actions'],data.triggers.map(t=>{
        const controls=actions();if(canWrite)controls.append(c.button('Edit',()=>edit(t)),run(t.enabled?'Disable':'Enable',async()=>{await api(`triggers/${t.id}`,{...t,enabled:!t.enabled});await refresh();}),run('Remove',async()=>{if(!confirm(`Remove ${t.name}? Execution history is retained.`))return;await api(`triggers/${t.id}/remove`,{});await refresh();}));
        if(canWrite)controls.append(run('Clone',async()=>{await api(`triggers/${t.id}/clone`,{});await refresh();c.notice('Clone created disabled. Edit and enable when ready.');}));
        return [t.name,t.kind,Object.entries(t.conditions).map(([k,v])=>`${k}: ${v}`).join(' · ')||'All events of this type',t.action,t.status,controls];
      }));
      if(canWrite){panel.append(c.button('Create trigger',()=>edit(null),'primary'));root.append(editor);edit(null);}return root;
    }
    if(page==='trigger-debug') {
      const [data,triggers]=await Promise.all([api('trigger-debug'),api('triggers')]);
      const panel=card('Trigger Debug','Evaluate against a recorded event without creating an execution or sending a message.');root.append(panel);
      if(canWrite&&triggers.triggers.length&&data.events.length) {
        const trigger=select('automation-debug-trigger',triggers.triggers.map(t=>[String(t.id),t.name]));
        const event=select('automation-debug-event',data.events.map(e=>[String(e.id),`${date(e.at)} · ${e.rule||e.kind} · ${e.playerName}`]));
        const output=el('div','automation-debug-result');output.setAttribute('aria-live','polite');
        panel.append(field('Trigger',trigger),field('Recorded event',event),run('Evaluate only',async()=>{
          const result=await api('trigger-debug',{triggerId:Number(trigger.value),eventId:Number(event.value)});
          output.replaceChildren(el('h3','',result.matched?'Matched':'Not matched'),el('p','',`Action: ${result.action}. No execution or delivery performed.`));
          table(output,['Condition','Expected','Actual','Result'],result.checks.map(check=>[check.field,String(check.expected),String(check.actual),check.expected===check.actual?'Match':'Mismatch']));
        }),output);
      }else empty(panel,canWrite?'Create a trigger and collect telemetry to evaluate a recorded event.':'Viewer access: execution history only.');
      const history=card('Executions','Latest 200 trigger and automatic logger executions. Rate limits and transient failures retry up to five attempts. Interrupted deliveries may duplicate a message already accepted by Discord.');
      history.append(run('Refresh',refresh));
      table(history,['Time','Trigger','Event','Action','Status','Details'],data.executions.map(e=>[date(e.at),e.triggerName,e.eventKey,e.action,e.status,c.button('View',()=>c.details('Execution',{ID:e.id,Event:e.eventKey,Status:e.status,Finished:date(e.finished)},e))]));
      root.append(history);return root;
    }
    if(page==='trigger-analytics') {
      const data=await api(`trigger-analytics?${new URLSearchParams(filters)}`);
      const filterPanel=card('Analytics filters'),range=select('automation-range',[['24h','Last 24 hours'],['7d','Last 7 days'],['30d','Last 30 days'],['all','All time']]);
      const trigger=select('automation-analytics-trigger',[['','All triggers'],...data.availableTriggers.map(t=>[String(t.id),t.name])]);range.value=filters.range;trigger.value=filters.triggerId;
      filterPanel.append(field('Date range',range),field('Trigger',trigger),run('Apply filters',async()=>{filters={range:range.value,triggerId:trigger.value};await refresh();}));root.append(filterPanel);
      const stats=el('div','automation-stats');
      const counts=Object.fromEntries(data.totals.map(row=>[row.status,row.count]));
      const values=[['Executions',data.totals.reduce((sum,row)=>sum+row.count,0)],['Delivered',counts.delivered||0],['Failed',counts.failed||0],['Pending',(counts.queued||0)+(counts.sending||0)]];
      for(const [label,value] of values){const tile=card(label);tile.append(el('strong','automation-stat-value',number(value)));stats.append(tile);}
      root.append(stats);
      const panel=card('Trigger Analytics','Actual executions matching the selected date range and trigger.');panel.append(run('Refresh',refresh));
      table(panel,['Trigger','Action','Status','Executions','Last execution'],data.triggers.map(row=>[row.triggerName,row.action,row.status,number(row.count),date(row.lastExecution)]));root.append(panel);
      const daily=card('Daily activity','Actual executions by UTC day within the selected filters.');
      table(daily,['Day (UTC)','Status','Executions'],data.daily.map(row=>[row.day,row.status,number(row.count)]));root.append(daily);return root;
    }
    return root;
  }
  return {render};
})();
