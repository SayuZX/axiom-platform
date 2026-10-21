'use strict';
const $ = (id) => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const iconPaths = {
  menu:'M3 6h18M3 12h18M3 18h18',close:'m6 6 12 12M6 18 18 6',chevron:'m9 5 7 7-7 7',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',user:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-2a8 8 0 0 1 16 0v2',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',server:'M3 3h18v7H3zM3 14h18v7H3zM6 6h1M6 17h1',
  code:'m8 5-6 7 6 7M16 5l6 7-6 7',identity:'M4 12a8 8 0 0 1 16 0M7 12a5 5 0 0 1 10 0c0 5-1 7-2 9M10 12a2 2 0 0 1 4 0v5M4 15v3M7 15v6M10 16v6',
  threat:'M12 3 1 21h22L12 3ZM12 9v5M12 17v1',game:'M7 6h10l4 3 2 10-3 2-5-5H9l-5 5-3-2L3 9l4-3ZM5 10v5M3 12h5M16 10h1M19 13h1',
  list:'m2 6 2 2 4-4M11 6h11M2 14l2 2 4-4M11 14h11M11 21h11',send:'m2 3 20 9-20 9 5-9-5-9ZM7 12h15',flame:'M12 2c2 7 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 4-9 0 5 3 6 3-4Z',chart:'M3 3v18h18M5 15l5-5 4 3 6-7',link:'m8 9-3 3a4 4 0 0 0 6 6l3-3M10 9l3-3a4 4 0 0 1 6 6l-3 3M9 15l6-6',ban:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M6 6l12 12',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6',
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  players: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-3.87',
  settings: 'M4 7h16M4 17h16M8 3v8M16 13v8',
  integrity: 'M7 2h10v4H7zM7 4H4v18h16V4h-3M8 13l3 3 5-6',
  audit: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
  enter: 'M14 3h6v18h-6M3 12h12M10 7l5 5-5 5',
  leave: 'M10 3H4v18h6M9 12h12M16 7l5 5-5 5'
};
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function svg(tag, attrs = {}) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
function icon(name) {
  const node = svg('svg', {viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true'});
  node.append(svg('path', {d:iconPaths[name] || iconPaths.shield}));
  return node;
}
function button(text, action, className = 'subtle') {
  const node = el('button', className, text); node.type = 'button';
  node.addEventListener('click', action); return node;
}
function card(title, subtitle) {
  const node = el('section', 'card'); const head = el('div', 'section-head');
  const titles = el('div'); titles.append(el('h2', '', title));
  if (subtitle) titles.append(el('p', '', subtitle));
  head.append(titles); node.append(head); return node;
}
function empty(parent, text) { parent.append(el('p', 'empty', text)); }
function date(value) { return value ? new Date(value).toLocaleString() : 'Not available'; }
function number(value) { return Number.isFinite(value) ? value.toLocaleString() : '—'; }
let csrf = '', authenticated = false, state = null, page = '', polling = false;
let chartMode = 'combined', routeVersion = 0, liveError = '';
let currentUser=null,recentPages=[];
const pages = {
  dashboard:['Dashboard','General information about your server'],
  server:['Server overview','Status and connected resources'],storage:['Image storage','Captured game evidence stored on this server'],
  resources:['Server / Resources','Administrator resource controls and native execution receipts'],
  players:['Players','Connected players and their live session details'],apollo:['Apollo / Players','Real-time player monitoring and interaction'],streams:['Apollo / MultiStream','Game screenshots with an explicit refresh interval'],map:['Apollo / Map','Server-reported player positions'],leaderboard:['Apollo / Leaderboard','Activity on your server'],scripts:['Apollo / Scripts','Audited server administration presets'],'event-protection':['Apollo / Event Protection','Server event firewall and resource status'],
  identities:['Identities','Search local players and linked identifiers'],threats:['Threat list','Local bans managed on your server'],whitelist:['Whitelist','Local ban bypasses with expiry'],
  webhooks:['Webhooks','Manage Discord notification destinations'],triggers:['Triggers','Event-driven automation rules'],'trigger-debug':['Triggers / Debug','Evaluate conditions without executing actions'],'trigger-analytics':['Triggers / Analytics','Recorded trigger execution results'],users:['Users','Dashboard accounts and passwords'],groups:['Groups','Role permissions'],
  'event-drains':['Event drains','Signed event delivery to your HTTPS services'],
  logs:['Logs / Viewer','Query and export server evidence'],'log-stats':['Logs / Statistics','Event distribution and volume'],events:['Logs / Events','Structured event search'],
  detections:['Logs / Events','Search events and investigate detection evidence'],configs:['Configs / General','Configuration for the anti-cheat'],protections:['Configs / Protection','Detection rules and local exemptions'],integrity:['Server / Integrity','Verify resources against the trusted manifest'],audit:['Logs / Audit','Administrative changes and actions']
};
const navItems=[['Dashboard','dashboard','dashboard'],['Server','server',[['Overview','server'],['Resources','resources'],['Storage','storage'],['Integrity','integrity']]],['Configs','code','configs'],['Logs','audit',[['Viewer','logs'],['Events','events'],['Statistics','log-stats'],['Audit','audit']]],['Identities','identity','identities'],['Threats','threat','threats'],['Apollo','game',[['Players','apollo'],['MultiStream','streams'],['Leaderboard','leaderboard'],['Map','map'],['Scripts','scripts'],['Event Protection','event-protection']]],['Whitelist','list','whitelist'],['Webhooks','send',[['Webhooks','webhooks'],['Event drains','event-drains']]],['Triggers','flame',[['Overview','triggers'],['Debug','trigger-debug'],['Analytics','trigger-analytics']]],['Users','players',[['Users','users'],['Groups','groups']]]];
function buildNavigation(){
  const nav=$('navigation');nav.replaceChildren();
  for(const [label,symbol,target] of navItems){
    if(typeof target==='string') {const link=el('a','nav-link');link.href='#'+target;link.dataset.page=target;link.append(icon(symbol),el('span','',label));nav.append(link);continue;}
    const group=el('div','nav-group'),children=el('div','nav-children');children.hidden=true;children.id='nav-'+symbol;
    const toggle=button('',()=>{children.hidden=!children.hidden;toggle.setAttribute('aria-expanded',String(!children.hidden));},'nav-group-toggle');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',children.id);toggle.append(icon(symbol),el('span','',label),icon('chevron'));
    for(const [name,dest] of target){if(dest==='users'&&currentUser.role!=='owner')continue;const link=el('a','nav-link',name);link.href='#'+dest;link.dataset.page=dest;children.append(link);}
    group.append(toggle,children);nav.append(group);
  }
}
function setMenu(open){
  $('sidebar').classList.toggle('open',open);$('menu-backdrop').hidden=!open;$('menu-open').setAttribute('aria-expanded',String(open));
  const mobile=matchMedia('(max-width:700px)').matches;
  $('main').inert=mobile&&open;document.querySelector('.mobile-header').inert=mobile&&open;
  $('sidebar').inert=mobile&&!open;if(mobile){if(open)$('menu-close').focus();else $('menu-open').focus();}
}
function moduleFor(target){
  if(target==='resources')return window.GuardResourceControl;
  if(target==='configs')return window.GuardFullConfig;
  if(target==='event-drains')return window.GuardDrains;
  if(['detections','events','logs','log-stats','audit'].includes(target))return window.GuardLogs;
  if(['server','storage','identities','threats','whitelist'].includes(target))return window.GuardManagement;
  if(['webhooks','triggers','trigger-debug','trigger-analytics','users','groups'].includes(target))return window.GuardAutomation;
  if(['apollo','streams','map','leaderboard','scripts','event-protection','protections'].includes(target))return window.GuardProtection;
}
function moduleContext(target){return {el,button,card,field,input,select,tableShell,addRow,details,date,number,api,notice,action,signedOut,getState:()=>state,getUser:()=>currentUser,isCurrent:()=>page===target&&authenticated};}
function notice(text = '') { $('notice').textContent = text; $('notice').hidden = !text; }
let authGeneration=0;
function signedOut(message = '') {
  window.GuardProtection?.dispose?.();
  window.GuardResourceControl?.dispose?.();
  authGeneration++;
  authenticated = false; csrf = ''; state = null; currentUser = null; page = '';window.GuardFullConfig.discard();
  routeVersion++;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();$('content').replaceChildren();
  $('workspace').hidden = true; $('login').hidden = !!window.GuardNui;
  $('login-error').textContent = message;
  $('password').value = '';
  if(window.GuardNui)window.GuardNui.setStatus(message||'Close and reopen /axiomguard to reconnect.');else $('password').focus();
}
async function api(path, body) {
  const generation=authGeneration;
  const response = window.GuardNui?await window.GuardNui.request(path,body,csrf):await fetch(new URL(`api/${path}`, document.baseURI), {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    cache: 'no-store', signal: AbortSignal.timeout(12000),
    headers: body === undefined ? {} : {'Content-Type':'application/json', 'X-CSRF-Token':csrf},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  const result = await response.json().catch(() => ({error:'The server returned an unreadable response.'}));
  if(generation!==authGeneration||window.GuardNui&&!window.GuardNui.active())throw new DOMException('Dashboard closed.','AbortError');
  if (!response.ok) {
    if (response.status === 401 && authenticated) signedOut(window.GuardNui?'Administrator session ended. Close and reopen /axiomguard.':'Your session ended. Sign in again.');
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return result;
}
function errorText(error) {
  return error.name === 'TimeoutError' || error instanceof TypeError
    ? 'Cannot reach the dashboard service. Check your connection; live data will retry automatically.' : error.message;
}
async function action(node, task) {
  node.disabled = true;
  try { await task(); } catch (error) { if(error.name!=='AbortError')notice(errorText(error)); }
  finally { node.disabled = false; }
}
function details(title, fields, data) {
  const content = $('dialog-content'); content.replaceChildren(el('h2', '', title));
  content.firstChild.id = 'dialog-title';
  const list = el('dl');
  for (const [key, value] of Object.entries(fields)) list.append(el('dt', '', key), el('dd', '', value ?? 'Not available'));
  content.append(list);
  if (data !== undefined) content.append(el('pre', '', typeof data === 'string' ? data : JSON.stringify(data, null, 2)));
  $('dialog-close').textContent = 'Close'; $('dialog').showModal();
}
function dashboard() {
  const content = $('content'); content.replaceChildren();
  const stats = el('div', 'stats');
  const metrics=[{label:'Connections',value:state.stats.connections,symbol:'players',hint:'Connections in the last 24 hours'},{label:'Players',value:state.management.uniquePlayers,symbol:'game',hint:'Unique server-observed identities'},{label:'Banned',value:state.management.activeBans,symbol:'ban',hint:'Active local bans. Enforcement follows server mode.'},{label:'Retention',value:state.management.retention,symbol:'clock',hint:'Average completed session duration in minutes'}];
  for (const {label,value,symbol,hint} of metrics) {
    const tile = el('section', 'card stat'), image = el('span', 'stat-icon'), text = el('div');
    tile.title=hint;image.append(icon(symbol)); text.append(el('p', '', label), el('strong', '', number(value)));
    tile.append(image, text); stats.append(tile);
  }
  const overview = el('div', 'overview'), chart = card(chartMode[0].toUpperCase()+chartMode.slice(1), 'Previous 24 hours (latest hour is partial)');
  chart.classList.add('chart-card');
  const tabs = el('div', 'chart-tabs'); tabs.setAttribute('aria-label', 'Chart series');
  for (const mode of ['combined','connections','disconnections']) {
    const tab = button(mode[0].toUpperCase() + mode.slice(1), () => {
      chartMode = mode;
      chart.querySelector('h2').textContent=mode[0].toUpperCase()+mode.slice(1);
      for (const item of tabs.children) item.setAttribute('aria-pressed', String(item === tab));
      drawChart(chart.querySelector('.chart-holder'));
    });
    tab.setAttribute('aria-pressed', String(chartMode === mode)); tabs.append(tab);
  }
  chart.firstChild.append(tabs);
  const holder = el('div', 'chart-holder'); chart.append(holder); drawChart(holder);
  const quick = card('Quick links'), links = el('div', 'quick-links');quick.classList.add('quick-card');
  for (const target of recentPages.slice(0,6)) {
    if(!pages[target])continue;
    const link=el('a','quick-link');link.href='#'+target;
    const label=el('div');label.append(el('strong','',pages[target][0]),el('p','',pages[target][1]));link.append(icon('link'),label);links.append(link);
  }
  if(recentPages.length)quick.append(links);
  else {const blank=el('div','empty-state');blank.append(icon('link'),el('p','','No recent visits yet. Navigate around to see your quick links here.'));quick.append(blank);}
  overview.append(quick,chart);
  const lower=el('div','lower-grid');lower.append(disconnectPanel(),reasonPanel());
  content.append(stats, overview, lower, recentPanel());
}
function disconnectPanel(){
  const panel=card('Disconnect Reasons'),reasons=state.management.disconnectReasons;
  if(!reasons.length)empty(panel,'No disconnections in this period.');
  for(const reason of reasons){const row=el('div','list-row');row.append(el('span','reason-name',reason.reason),el('strong','',number(reason.count)));panel.append(row);}
  return panel;
}
function reasonPanel() {
  const panel = card('Detection reasons', 'Rule distribution · last 24 hours');
  const total = state.reasons.reduce((sum, item) => sum + item.count, 0);
  if (!total) empty(panel, 'No detections in this period.');
  for (const reason of state.reasons) {
    const row = el('div', 'reason'), label = el('div', 'list-row');
    label.append(el('span', 'reason-name', ruleLabel(reason.rule)), el('strong', '', number(reason.count)));
    const meter = el('div', 'meter'), fill = el('span'); fill.style.width = `${reason.count / total * 100}%`;
    meter.append(fill); row.append(label, meter); panel.append(row);
  }
  return panel;
}
function ruleLabel(id) { return state.rules.find(rule => rule.id === id)?.label || id || 'System'; }
function recentPanel() {
  const panel = card('Recent activity', 'Latest connections and detection signals');
  if (!state.recent.length) empty(panel, 'No server events received yet.');
  for (const event of state.recent.slice(0, 6)) {
    const row = el('div', 'list-row'), text = el('div');
    text.append(el('div', 'reason-name', event.playerName || ruleLabel(event.rule)), el('p', 'small', `${event.kind} · ${date(event.at)}`));
    row.append(text, button('Details', () => eventDetails(event))); panel.append(row);
  }
  return panel;
}
function drawChart(holder) {
  holder.replaceChildren();
  const rows = state.hourly;
  if (!rows.some(row=>row.connections||row.disconnections)) {const blank=el('div','empty-state');blank.append(icon('chart'),el('strong','','No chart data available'),el('p','','Data will appear once activity is recorded'));holder.append(blank);return;}
  const keys = chartMode === 'combined' ? ['connections','disconnections'] : [chartMode];
  const maximum = Math.max(4, ...rows.flatMap(row => keys.map(key => Number(row[key]) || 0)));
  const ceiling = Math.ceil(maximum / 4) * 4;
  const image = svg('svg', {viewBox:'0 0 720 260', class:'chart', role:'img', 'aria-label':`${chartMode} per hour over the last 24 hours`});
  const title = svg('title'); title.textContent = 'Hourly server activity'; image.append(title);
  for (let i = 0; i <= 4; i++) {
    const y = 20 + i * 49;
    image.append(svg('line', {x1:40, y1:y, x2:705, y2:y, class:'grid'}));
    const label = svg('text', {x:29, y:y + 4, 'text-anchor':'end'}); label.textContent = number(ceiling * (4 - i) / 4); image.append(label);
  }
  for (const key of keys) {
    const points = rows.map((row, i) => `${40 + i * 665 / Math.max(1, rows.length - 1)},${216 - (Number(row[key]) || 0) / ceiling * 196}`).join(' ');
    image.append(svg('polyline', {points, class:'line', stroke:key === 'connections' ? '#d47449' : '#98aaa5'}));
  }
  rows.forEach((row, i) => {
    if (i % Math.max(1, Math.ceil(rows.length / 8)) && i !== rows.length - 1) return;
    const label = svg('text', {x:40 + i * 665 / Math.max(1, rows.length - 1), y:242, 'text-anchor':'middle'});
    label.textContent = new Date(row.hour).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false}); image.append(label);
  });
  holder.append(image);
  const legend = el('p', 'small');
  legend.textContent = keys.map(key => key === 'connections' ? 'Orange: connections' : 'Gray: disconnections').join(' · ');
  holder.append(legend);
  const summary = el('details'), heading = el('summary', 'small', 'View hourly data'); summary.append(heading);
  const table = tableShell(['Hour','Connections','Disconnections']);
  for (const row of rows) addRow(table.body, [date(row.hour), number(row.connections), number(row.disconnections)]);
  summary.append(table.wrap); holder.append(summary);
}
function tableShell(headers) {
  const wrap = el('div', 'table-wrap'), table = el('table'), head = el('thead'), row = el('tr'), body = el('tbody');
  for (const header of headers) { const cell = el('th', '', header); cell.scope = 'col'; row.append(cell); }
  head.append(row); table.append(head, body); wrap.append(table); return {wrap, body};
}
function addRow(body, values) {
  const row = el('tr');
  for (const value of values) { const cell = el('td'); cell.append(value instanceof Node ? value : document.createTextNode(String(value ?? '—'))); row.append(cell); }
  body.append(row);
}
function field(label, input) {
  const wrapper = el('div', 'field'), title = el('label', '', label);
  title.htmlFor = input.id; wrapper.append(title, input); return wrapper;
}
function input(id, type = 'search') { const node = el('input'); node.id = id; node.type = type; return node; }
function select(id, options) {
  const node = el('select'); node.id = id;
  for (const [value, label] of options) { const option = el('option', '', label); option.value = value; node.append(option); }
  return node;
}
function playersPage() {
  const panel = card('Connected players', 'Search by player name or server ID.'), search = input('player-search');
  search.placeholder = 'Search players…'; search.addEventListener('input', renderPlayers);
  const toolbar = el('div', 'toolbar'); toolbar.append(field('Search players', search));
  const results = el('div'); results.id = 'player-results'; panel.append(toolbar, results);
  $('content').replaceChildren(panel); renderPlayers();
}
function renderPlayers() {
  const holder = $('player-results'); if (!holder) return;
  const query = $('player-search').value.toLocaleLowerCase().trim();
  const players = state.server.players.filter(player => `${player.id} ${player.name}`.toLocaleLowerCase().includes(query));
  holder.replaceChildren();
  if (!players.length) { empty(holder, query ? 'No players match your search.' : 'No connected players reported.'); return; }
  const table = tableShell(['ID','Player','Ping','Session']);
  for (const player of players) addRow(table.body, [player.id, player.name, `${number(player.ping)} ms`, button('Details', () => details('Player details', {'Server ID':player.id, Name:player.name, Ping:`${number(player.ping)} ms`}, {identifiers:player.identifiers}))]);
  holder.append(table.wrap);
}
function eventDetails(event) {
  details('Event details', {ID:event.id, Time:date(event.at), Kind:event.kind, Player:event.playerName || 'Server', 'Player ID':event.playerId, Rule:ruleLabel(event.rule), Severity:event.severity, Review:event.reviewed ? 'Reviewed' : 'Unreviewed'}, event.details);
}
function integrityPage() {
  const panel = card('Native integrity', 'Manifest verification · trusted baseline is never updated automatically.');
  const scan = button('Run integrity scan', () => action(scan, async () => {
    const result = await api('native/scan', {});
    if (!authenticated || !state) return;
    state.native = result.native; renderIntegrity(); notice();
  }), 'primary');
  panel.firstChild.append(scan); const holder = el('div'); holder.id = 'integrity-results';
  panel.append(holder); $('content').replaceChildren(panel); renderIntegrity();
}
function renderIntegrity() {
  const holder = $('integrity-results'); if (!holder) return;
  const report = state.native; holder.replaceChildren();
  const label = report.error ? 'Scan unavailable' : report.ok === true ? 'Integrity verified' : report.ok === false ? 'Integrity violations detected' : 'Not scanned yet';
  holder.append(el('h3', report.ok === false ? 'danger' : '', label));
  const fields = el('dl');
  for (const [key,value] of [['Engine',report.engine || 'Not available'],['Last scan',date(report.checkedAt)],['Files checked',number(report.checked)]]) fields.append(el('dt','',key),el('dd','',value));
  holder.append(fields);
  if (report.error) holder.append(el('p','danger',report.error));
  if(report.publication){
    const publication=report.publication;holder.append(el('h3',publication.ok===false?'danger':'','Public resource distribution'));
    holder.append(el('p','small',publication.ok===true?`Assembly audit: ${number(publication.checked)} public files, ${number(publication.privateFiles)} private files checked.`:publication.error||`${publication.violations?.length||0} unsafe public files detected.`));
    if(publication.violations?.length){const leaked=tableShell(['Public path','Reason']);for(const item of publication.violations)addRow(leaked.body,[item.path,item.reason]);holder.append(leaked.wrap);}
  }
  if (report.violations?.length) {
    const table = tableShell(['File','Mismatch reason']);
    for (const entry of report.violations) addRow(table.body, [entry.path, entry.reason]); holder.append(table.wrap);
  } else empty(holder, report.ok === true ? 'No mismatches found.' : 'No completed clean scan is available.');
}
async function navigate() {
  if (!authenticated || !state) return;
  const target = location.hash.slice(1);
  const next = Object.hasOwn(pages, target) ? target : 'dashboard';
  if (next === page) return;
  if(page==='configs'&&window.GuardFullConfig.hasDirty()&&!window.confirm('Discard unsaved configuration changes?')){
    history.replaceState(null, '', '#configs'); return;
  }
  window.GuardProtection?.dispose?.();
  window.GuardResourceControl?.dispose?.();
  window.GuardFullConfig.discard();
  page = next; routeVersion++; notice();
  const version=routeVersion;
  if(page!=='dashboard'){recentPages=[page,...recentPages.filter(p=>p!==page)].slice(0,6);try{sessionStorage.setItem('guard_recent_pages',JSON.stringify(recentPages));}catch{}}
  $('main').scrollTop=0;$('time-range').hidden=page!=='dashboard';setMenu(false);
  $('page-title').textContent = pages[page][0]; $('page-subtitle').textContent = pages[page][1];
  document.title = `${pages[page][0]} · AXIOM GUARD`;
  for (const link of document.querySelectorAll('nav a')) {
    const active = link.dataset.page === page; link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    if(active&&link.closest('.nav-children')){const group=link.closest('.nav-group');group.querySelector('.nav-children').hidden=false;group.querySelector('button').setAttribute('aria-expanded','true');}
  }
  const renderer=({dashboard,players:playersPage,integrity:integrityPage})[page];
  if(renderer){renderer();return;}
  const module=moduleFor(page),targetPage=page;
  $('content').replaceChildren(el('p','empty','Loading…'));
  try{const node=await module.render(targetPage,moduleContext(targetPage));if(version===routeVersion&&authenticated)$('content').replaceChildren(node);}
  catch(error){if(version===routeVersion){$('content').replaceChildren(el('p','empty','Unable to load this page.'));notice(errorText(error));}}
}
function updateHeader() {
  $('server-name').textContent = state.server.name;
  $('server-status').textContent = state.server.online ? 'Server connected' : 'Server offline';
  $('server-status').classList.toggle('online', state.server.online);
  $('mode').textContent = state.server.online ? `${state.server.mode} mode${state.server.mode !== state.config.mode ? ' · change pending' : ''}` : 'Server offline';
  $('mode').title = `Configured mode: ${state.config.mode}. Live mode is reported by the server.`;
  $('updated').textContent = `Last heartbeat: ${date(state.server.lastSeen)} · refreshes every 5s`;
}
async function refresh() {
  if (!authenticated || polling) return;
  polling = true;
  try {
    const result = await api('state'); if (!authenticated) return;
    state = result; updateHeader();
    if (liveError && $('notice').textContent === liveError) notice();
    liveError = '';
    if (!page) navigate();
    else if (!$('dialog').open) {
      const focused = $('content').contains(document.activeElement);
      if (page === 'dashboard' && !focused) dashboard();
      if (page === 'players' && !document.activeElement.closest('#player-results')) renderPlayers();
      if (page === 'integrity' && !focused) renderIntegrity();
    }
  } catch (error) { if(error.name!=='AbortError'){liveError = errorText(error); notice(liveError); $('updated').textContent = 'Live refresh unavailable · showing last received data';} }
  finally { polling = false; }
}
async function signedIn(csrfToken,user) {
  if(window.GuardNui&&!window.GuardNui.active())return;
  window.GuardNui?.setStatus('');
  csrf = csrfToken;currentUser=user;authenticated = true; $('password').value = '';
  $('account-name').textContent=user.name;buildNavigation();
  try{const stored=JSON.parse(sessionStorage.getItem('guard_recent_pages')||'[]');recentPages=Array.isArray(stored)?stored.filter(p=>Object.hasOwn(pages,p)).slice(0,6):[];}catch{recentPages=[];}
  $('login').hidden = true; $('workspace').hidden = false;
  $('content').replaceChildren(el('p','empty','Loading server data…'));
  await refresh();
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  $('login-error').textContent = '';
  try {
    const result = await api('login', {password:$('password').value}); $('password').value = '';
    await signedIn(result.csrf,result.user);
  } catch (error) { $('password').value = '';if(error.name!=='AbortError')$('login-error').textContent = errorText(error); }
  finally { submit.disabled = false; }
});
$('logout').addEventListener('click', () => action($('logout'), async () => {
  if(window.GuardFullConfig.hasDirty()&&!window.confirm('Sign out and discard unsaved configuration changes?'))return;
  await api('logout', {}); signedOut();
}));
$('dialog-close').addEventListener('click', () => $('dialog').close());
window.addEventListener('hashchange', navigate);
window.addEventListener('beforeunload', event => {
  if(window.GuardFullConfig.hasDirty()){event.preventDefault();event.returnValue='';}
});
$('menu-open').addEventListener('click',()=>setMenu(true));$('menu-close').addEventListener('click',()=>setMenu(false));$('menu-backdrop').addEventListener('click',()=>setMenu(false));
$('settings').addEventListener('click',()=>{location.hash='#configs';});
$('mobile-notifications').addEventListener('click',()=>details('Recent server signals',{Server:state?.server.name||'Offline'},state?.recent.map(e=>({at:e.at,rule:e.rule,severity:e.severity}))||[]));
const mobileQuery=matchMedia('(max-width:700px)');mobileQuery.addEventListener('change',()=>setMenu(false));$('sidebar').inert=mobileQuery.matches;
document.addEventListener('keydown',event=>{
  if(!$('sidebar').classList.contains('open'))return;
  if(event.key==='Escape'){setMenu(false);return;}
  if(event.key==='Tab'&&mobileQuery.matches){const nodes=[...$('sidebar').querySelectorAll('a,button')].filter(n=>n.getClientRects().length&&!n.disabled);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
for (const item of document.querySelectorAll('[data-icon]')) item.replaceChildren(icon(item.dataset.icon));
async function boot() {
  try {
    const session = await api('session');
    if (session.authenticated) await signedIn(session.csrf,session.user); else signedOut();
  } catch (error) { if(error.name!=='AbortError')signedOut(errorText(error)); }
}
setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
if(window.GuardNui){
  window.GuardNui.onOpen(async()=>{
    signedOut('Authorizing your in-game administrator session…');
    const generation=authGeneration;
    try{const session=await window.GuardNui.authenticate();if(generation===authGeneration&&window.GuardNui.active())await signedIn(session.csrf,session.user);}
    catch(error){if(error.name!=='AbortError'&&generation===authGeneration&&window.GuardNui.active())signedOut(errorText(error)+' Close and reopen /axiomguard.');}
  });
  window.GuardNui.onClose(()=>{setMenu(false);signedOut();});
  void window.GuardNui.ready();
}else void boot();
