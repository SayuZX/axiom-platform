(() => {
  'use strict';
  if (typeof GetParentResourceName !== 'function') return;

  const resource = GetParentResourceName();
  const requests = new Set();
  let opened = false, initialized = false, base = null, ticket = '', token = '', csrfToken = '', generation = 0;
  let openHandler = () => {}, closeHandler = () => {};

  document.documentElement.classList.add('nui-mode');
  document.body.classList.add('nui-mode');
  const shell = document.createElement('section');
  shell.className = 'nui-shell';
  shell.setAttribute('aria-label', 'AXIOM Guard dashboard');
  shell.hidden = true;
  shell.inert = true;
  const toolbar = document.createElement('header');
  toolbar.className = 'nui-toolbar';
  const title = document.createElement('span');
  title.textContent = 'AXIOM Guard · In-game dashboard';
  const closeButton = document.createElement('button');
  closeButton.id = 'nui-close';
  closeButton.type = 'button';
  closeButton.textContent = 'Close · Esc';
  closeButton.setAttribute('aria-label', 'Close dashboard and return to game');
  toolbar.append(title, closeButton);
  const surface = document.createElement('div');
  surface.className = 'nui-surface';
  const login = document.getElementById('login');
  login.hidden = true;
  login.inert = true;
  const status = document.createElement('div');
  status.className = 'nui-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  surface.append(login, status, document.getElementById('workspace'));
  shell.append(toolbar, surface);
  document.body.append(shell);

  function nativeCallback(name) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    return fetch(`https://${resource}/${name}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}',
      credentials: 'omit', signal: controller.signal
    }).finally(() => clearTimeout(timeout));
  }

  function clearSession() {
    generation++;
    ticket = '';
    token = '';
    csrfToken = '';
    for (const controller of requests) controller.abort();
    requests.clear();
  }

  function setStatus(message) {
    login.hidden = true;
    login.inert = true;
    status.textContent = message || '';
    status.hidden = !message;
  }

  function publicBase(value) {
    if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/[A-Za-z0-9._~/-]*)?$/.test(value)) return null;
    try {
      const url = new URL(value);
      const rawPath = value.slice(value.indexOf('://') + 3).replace(/^[^/]+/, '') || '/';
      if (rawPath.includes('//') || rawPath.split('/').some(part => part === '.' || part === '..')) return null;
      if (url.hostname.length > 253 || url.hostname.split('.').some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return null;
      if (url.port && Number(url.port) < 1) return null;
      if (!url.pathname.endsWith('/')) url.pathname += '/';
      return url;
    } catch { return null; }
  }

  function apiUrl(path) {
    if (typeof path !== 'string' || path.length > 8192 || /[\\#\s]/.test(path)) throw new Error('Invalid dashboard API path.');
    const pathname = path.split('?')[0];
    if (!pathname || pathname.split('/').some(part => {
      if (!/^[A-Za-z0-9_.~%:-]+$/.test(part)) return true;
      try { return !/^[A-Za-z0-9_~:.-]+$/.test(decodeURIComponent(part)) || ['.', '..'].includes(decodeURIComponent(part)); }
      catch { return true; }
    })) throw new Error('Invalid dashboard API path.');
    const url = new URL(`api/${path}`, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}api/`)) throw new Error('Invalid dashboard API destination.');
    return url;
  }

  async function request(path, body, csrf) {
    if (!opened || !base) throw new DOMException('Dashboard is closed.', 'AbortError');
    if (path === 'login') throw new Error('Use /axiomguard to authenticate with your server permissions.');
    const url = apiUrl(path), version = generation, authToken = token;
    const controller = new AbortController();
    requests.add(controller);
    const timeout = setTimeout(() => controller.abort(new DOMException('Dashboard request timed out.', 'TimeoutError')), 12000);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = csrf || csrfToken;
    }
    try {
      const fetched = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers, signal: controller.signal,
        ...(body === undefined ? {} : {body: JSON.stringify(body)})
      });
      const bytes = await fetched.arrayBuffer();
      const response = new Response(bytes.byteLength ? bytes : null, {status: fetched.status, statusText: fetched.statusText, headers: fetched.headers});
      if (version !== generation || !opened) throw new DOMException('Dashboard session changed.', 'AbortError');
      if (response.status === 401 && token === authToken) {
        token = '';
        csrfToken = '';
      }
      return response;
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
      if (path === 'logout' && version === generation) clearSession();
    }
  }

  async function authenticate() {
    if (!opened || !ticket) throw new Error('Close the dashboard and run /axiomguard for a new authentication ticket.');
    const openingTicket = ticket, version = generation;
    ticket = '';
    const response = await request('nui-session', {ticket: openingTicket});
    const session = await response.json();
    if (version !== generation || !opened) throw new DOMException('Dashboard session changed.', 'AbortError');
    if (!response.ok) throw new Error(session.error || 'Server administrator authentication was denied. Close and run /axiomguard again.');
    if (session.authenticated !== true || typeof session.token !== 'string' || !session.token || typeof session.csrf !== 'string' || !session.csrf || !session.user) {
      throw new Error('Dashboard returned an invalid in-game session.');
    }
    token = session.token;
    csrfToken = session.csrf;
    return session;
  }

  function close(notifyNative = true) {
    // Release game input immediately; backend availability must never trap focus.
    if (notifyNative) void nativeCallback('dashboardClose').catch(() => {});
    if (!opened) return;
    const logoutBase = base, logoutToken = token, logoutCsrf = csrfToken;
    opened = false;
    base = null;
    clearSession();
    setStatus('');
    document.body.classList.remove('nui-open');
    shell.hidden = true;
    shell.inert = true;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    closeHandler();
    if (logoutToken && logoutBase) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      void fetch(new URL('api/logout', logoutBase), {
        method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${logoutToken}`, 'X-CSRF-Token': logoutCsrf}, body: '{}'
      }).catch(() => {}).finally(() => clearTimeout(timeout));
    }
  }

  closeButton.addEventListener('click', () => close());
  document.addEventListener('keydown', event => {
    if (!opened || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    const focusedDialog = document.activeElement?.closest('dialog[open]');
    const dialog = focusedDialog || dialogs.at(-1);
    if (dialog) {
      if (dialog.dispatchEvent(new Event('cancel', {cancelable: true}))) dialog.close();
      return;
    }
    if (document.getElementById('sidebar').classList.contains('open')) {
      document.getElementById('menu-close').click();
      return;
    }
    close();
  }, true);

  window.addEventListener('message', event => {
    // FiveM's root page forwards native messages to this resource iframe.
    if ((event.source !== null && event.source !== window && event.source !== window.parent) || !event.data || typeof event.data !== 'object') return;
    if (event.data.action === 'axiom_guard:close') { close(false); return; }
    if (event.data.action !== 'axiom_guard:open' || opened || !initialized) return;
    const url = publicBase(event.data.url);
    if (!url || typeof event.data.ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(event.data.ticket)) { close(); return; }
    clearSession();
    base = url;
    ticket = event.data.ticket;
    opened = true;
    shell.hidden = false;
    shell.inert = false;
    document.body.classList.add('nui-open');
    setStatus('Verifying server administrator access…');
    openHandler();
  });
  window.addEventListener('pagehide', () => close());

  window.GuardNui = Object.freeze({
    request,
    authenticate,
    setStatus,
    active: () => opened,
    onOpen: callback => { openHandler = callback; },
    onClose: callback => { closeHandler = callback; },
    ready: () => {
      if (initialized) return;
      initialized = true;
      void nativeCallback('dashboardReady').catch(() => { initialized = false; });
    }
  });
})();
