import { parse } from 'parse5';

const CHECK_MS = 30_000;
const TIMEOUT_MS = 5_000;
const CFX_SOURCE = 'https://support.rockstargames.com/servicestatus';
const cacheKey = Symbol.for('axiom.health.snapshot');
const cache = globalThis[cacheKey] ??= { snapshot: null, expiresAt: 0, pending: null };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : null;

function unknownCfx(message = 'Halaman status resmi Rockstar tidak dapat dibaca atau diverifikasi saat ini. Status Cfx.re belum diketahui; buka sumber resmi untuk konfirmasi.') {
  return { state: 'unknown', label: 'Belum diketahui', message, sourceUrl: CFX_SOURCE, updatedAt: null, components: [], incidents: [], incidentsAvailable: false };
}

function unknownFiveM(message = 'Pemeriksaan server belum dapat diselesaikan.') {
  return { state: 'unknown', label: 'Belum diketahui', message, latencyMs: null, players: null, maxPlayers: null, hostname: null };
}

export function unknownHealth() {
  return { checkedAt: new Date().toISOString(), nextCheckMs: CHECK_MS, fivem: unknownFiveM(), cfx: unknownCfx() };
}

async function fetchBody(url, limit, json = true) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  let received = false;
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'error', headers: { Accept: json ? 'application/json' : 'text/html', 'Accept-Language': 'en-US', 'User-Agent': 'AxiomHealth/1.0' } });
    received = true;
    if (!response.ok || !response.body) throw new Error('http');
    const length = Number(response.headers.get('content-length'));
    if (length > limit) throw new Error('size');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let body = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error('size');
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return { ok: true, received, data: json ? JSON.parse(body) : body, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    // No upstream error text or URL crosses the public boundary.
    const code = error?.cause?.code;
    const unreachable = controller.signal.aborted || ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT'].includes(code);
    return { ok: false, received, unreachable, latencyMs: null };
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

function playerCount(value, minimum = 0) {
  if (typeof value === 'string' && /^\d{1,5}$/.test(value)) value = Number(value);
  return Number.isInteger(value) && value >= minimum && value <= 65535 ? value : null;
}

export function summarizeFiveM(info, dynamic, latencyMs) {
  const infoValid = info.ok && object(info.data) && text(info.data.server, 300) !== null && object(info.data.vars);
  const data = dynamic.ok && object(dynamic.data) ? dynamic.data : {};
  let players = playerCount(data.clients);
  const maxPlayers = playerCount(data.sv_maxclients, 1);
  const hostname = text(data.hostname, 300);
  if (players !== null && maxPlayers !== null && players > maxPlayers) players = null;
  const dynamicValid = players !== null && maxPlayers !== null && hostname !== null;
  const healthy = infoValid && dynamicValid;
  const offline = !info.received && !dynamic.received && info.unreachable && dynamic.unreachable;
  const partial = infoValid || dynamicValid || info.received || dynamic.received;
  const state = healthy ? 'online' : offline ? 'offline' : partial ? 'degraded' : 'unknown';
  const labels = { online: 'Online', offline: 'Offline', degraded: 'Data terbatas', unknown: 'Belum diketahui' };
  const messages = {
    online: 'Endpoint FiveM merespons dengan data valid. Waktu respons HTTP diukur dari VPS, bukan ping pemain; bukan jaminan dapat bergabung.',
    offline: 'Endpoint FiveM tidak dapat dijangkau dari VPS. Server mungkin belum berjalan atau koneksi tidak tersedia.',
    degraded: 'Endpoint merespons sebagian, ditolak, atau mengirim data tidak lengkap. Kesiapan bermain belum dapat dipastikan.',
    unknown: 'Status FiveM tidak dapat diverifikasi dari VPS saat ini.',
  };
  return { state, label: labels[state], message: messages[state], latencyMs: infoValid || dynamicValid ? latencyMs : null, players, maxPlayers, hostname };
}

async function probeFiveM() {
  let base;
  try {
    base = new URL(process.env.FIVEM_BASE_URL || 'http://127.0.0.1:30120');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('configuration');
  } catch {
    return unknownFiveM('Konfigurasi pemeriksaan server tidak valid; administrator perlu memeriksanya.');
  }
  const started = performance.now();
  const [info, dynamic] = await Promise.all([
    fetchBody(new URL('/info.json', base), 512 * 1024),
    fetchBody(new URL('/dynamic.json', base), 32 * 1024),
  ]);
  return summarizeFiveM(info, dynamic, Math.round(performance.now() - started));
}

const attribute = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const nodeText = (node) => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(nodeText).join('');

function descendants(root, predicate) {
  const matches = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (predicate(node)) matches.push(node);
    if (node.childNodes) stack.push(...node.childNodes);
  }
  return matches;
}

export function summarizeCfx(html) {
  if (typeof html !== 'string') return unknownCfx();
  const document = parse(html);
  const headings = descendants(document, (node) => node.tagName === 'h6' && attribute(node, 'data-testid') === 'status-section-heading' && nodeText(node).trim() === 'Cfx');
  if (headings.length !== 1) return unknownCfx();
  const section = headings[0].parentNode;
  if (descendants(section, (node) => attribute(node, 'data-testid') === 'status-section-heading').length !== 1) return unknownCfx();
  const items = descendants(section, (node) => node.tagName === 'p' && /^status-item-\d+$/.test(attribute(node, 'data-testid') ?? ''));
  const names = ['Authentication', 'FiveM', 'RedM', 'Community Servers', 'Marketplace'];
  const vocabulary = { 'All services operational': 'operational', 'All services are down': 'outage', 'There are partial outages': 'degraded' };
  const labels = { operational: 'Operasional', outage: 'Gangguan besar', degraded: 'Terganggu' };
  if (items.length !== names.length) return unknownCfx();
  const components = [];
  for (const name of names) {
    const matching = items.filter((node) => nodeText(node).trim() === name && attribute(node, 'aria-label') === name);
    if (matching.length !== 1) return unknownCfx();
    const row = matching[0].parentNode;
    const spans = (row.childNodes ?? []).filter((node) => node.tagName === 'span');
    if (spans.length !== 1) return unknownCfx();
    const value = nodeText(spans[0]).trim();
    if (!Object.hasOwn(vocabulary, value)) return unknownCfx('Label status pada halaman resmi berubah; status Cfx.re belum dapat diverifikasi otomatis.');
    const state = vocabulary[value];
    components.push({ id: name.toLowerCase().replaceAll(' ', '-'), name, state, label: labels[state] });
  }
  const state = components.some((item) => item.state === 'outage') ? 'outage' : components.some((item) => item.state === 'degraded') ? 'degraded' : 'operational';
  return {
    state, label: labels[state], sourceUrl: CFX_SOURCE, updatedAt: null, components, incidents: [], incidentsAvailable: false,
    message: '',
  };
}

async function probeCfx() {
  const result = await fetchBody(CFX_SOURCE, 2 * 1024 * 1024, false);
  return result.ok ? summarizeCfx(result.data) : unknownCfx();
}

export async function getHealth() {
  if (cache.snapshot && Date.now() < cache.expiresAt) return cache.snapshot;
  if (!cache.pending) {
    cache.pending = (async () => {
      const [fivem, cfx] = await Promise.all([probeFiveM(), probeCfx()]);
      const snapshot = { checkedAt: new Date().toISOString(), nextCheckMs: CHECK_MS, fivem, cfx };
      cache.snapshot = snapshot;
      cache.expiresAt = Date.now() + CHECK_MS;
      return snapshot;
    })().catch(() => {
      const snapshot = unknownHealth();
      cache.snapshot = snapshot;
      cache.expiresAt = Date.now() + CHECK_MS;
      return snapshot;
    }).finally(() => { cache.pending = null; });
  }
  return cache.pending;
}
