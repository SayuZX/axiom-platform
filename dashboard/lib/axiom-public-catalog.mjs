const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers?limit=20&version=latest';
const SKILLS = 'https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1';
const MAX_BYTES = 2_000_000;
const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, max) : '';
function unavailable() { return Object.assign(new Error('Katalog publik tidak tersedia. Coba lagi nanti.'), { status: 503 }); }
async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'AXIOM-Public-Catalog' }, signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw unavailable();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw unavailable(); }
      body += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(body + decoder.decode());
}
// Fixed sources only: upstream metadata never becomes a server-side request URL.
export async function fetchPublicCatalog(kind, fetchImpl = fetch) {
  if (kind !== 'plugins' && kind !== 'skills') throw Object.assign(new Error('Jenis katalog tidak valid.'), { status: 400 });
  try {
    const payload = await fetchJson(kind === 'plugins' ? REGISTRY : SKILLS, fetchImpl);
    const items = [], seen = new Set();
    if (kind === 'plugins') {
      if (!Array.isArray(payload?.servers)) throw unavailable();
      for (const entry of payload.servers) {
        const server = entry?.server;
        const id = text(server?.name, 200);
        if (!id || id !== server.name || !/^[a-zA-Z0-9._/-]+$/.test(id) || seen.has(id) || entry?._meta?.['io.modelcontextprotocol.registry/official']?.status !== 'active') continue;
        seen.add(id);
        items.push({ id, name: text(server.title, 160) || id, description: text(server.description, 600), url: `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(id)}/versions/latest`, source: 'MCP Registry resmi' });
        if (items.length === 20) break;
      }
    } else {
      if (!Array.isArray(payload?.tree) || payload.truncated !== false || !/^[a-f0-9]{40}$/.test(payload.sha)) throw unavailable();
      for (const entry of payload.tree) {
        if (entry?.type !== 'blob' || typeof entry.path !== 'string' || !/^skills\/[a-zA-Z0-9][a-zA-Z0-9_-]*\/SKILL\.md$/.test(entry.path) || seen.has(entry.path)) continue;
        seen.add(entry.path);
        const name = entry.path.split('/')[1];
        items.push({ id: `anthropics/skills/${name}`, name, description: `Dokumen instruksi SKILL.md: ${name}. Baca isi dan persyaratannya di repositori sumber.`, url: `https://github.com/anthropics/skills/blob/${payload.sha}/${entry.path}`, source: 'anthropics/skills · GitHub' });
        if (items.length === 20) break;
      }
    }
    if (!items.length) throw unavailable();
    return { kind, items };
  } catch { throw unavailable(); }
}
