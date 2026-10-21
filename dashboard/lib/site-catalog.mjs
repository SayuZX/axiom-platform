import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boundedText, fail } from './merchant-http.mjs';
import { showcaseRecords, matchShowcase } from './model-store.mjs';
import { priceForModel } from './retail-pricing.mjs';

const slot = Symbol.for('axiom.ai.live.catalogue');
const cache = globalThis[slot] ??= { models: null, expires: 0, pending: null, generation: 0 };
const number = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
const clean = (value, max = 300) => typeof value === 'string' && value.length <= max ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';

export function invalidateSiteCatalog() {
  cache.models = null;
  cache.expires = 0;
  cache.pending = null;
  cache.generation++;
}
async function loadLiveModels() {
  const key = process.env.ROUTER_CATALOG_KEY;
  if (!key) throw fail(503, 'Katalog router belum dikonfigurasi.', 'catalog_unavailable');
  const response = await fetch('http://127.0.0.1:20128/v1/models', {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) throw fail(503, 'Katalog router tidak tersedia.', 'catalog_unavailable');
  const payload = JSON.parse(await boundedText(response, 2 * 1024 * 1024));
  if (!Array.isArray(payload.data)) throw fail(502, 'Respons katalog router tidak valid.', 'catalog_invalid');
  const seen = new Set();
  const models = [];
  for (const row of payload.data) {
    const id = clean(row?.id);
    if (!id || id !== row.id || seen.has(id)) continue;
    seen.add(id);
    const capability = row.capabilities ?? {};
    models.push({
      id, name: clean(row.name, 160) || id, provider: clean(row.owned_by, 100) || id.split('/')[0],
      contextWindow: number(row.context_length) ?? number(capability.contextWindow),
      maxOutput: number(row.max_completion_tokens) ?? number(capability.maxOutput),
      reasoning: capability.reasoning === true, vision: capability.vision === true,
      tools: capability.tools === true, search: capability.search === true,
    });
  }
  if (!models.length) throw fail(503, 'Tidak ada model terhubung di router.', 'catalog_unavailable');
  return models;
}
export async function getLiveModels({ fresh = false } = {}) {
  if (fresh) return loadLiveModels();
  if (cache.models && cache.expires > Date.now()) return cache.models;
  if (!cache.pending) {
    const generation = cache.generation;
    cache.pending = loadLiveModels().then(models => {
      if (generation === cache.generation) { cache.models = models; cache.expires = Date.now() + 60_000; }
      return models;
    }).finally(() => { if (generation === cache.generation) cache.pending = null; });
  }
  return cache.pending;
}
export async function getSiteCatalog() {
  try {
    const liveModels = await getLiveModels();
    const showcases = showcaseRecords();
    const prices = JSON.parse(readFileSync(join(process.env.NINEROUTER_DATA_DIR || 'C:/ProgramData/9router', 'axiom-retail.json'), 'utf8'));
    const matched = new Map();
    for (const row of showcases) {
      if (!row.isActive) continue;
      const live = matchShowcase(row, liveModels);
      if (live && !matched.has(live.id)) matched.set(live.id, row);
    }
    const models = liveModels.map(live => {
      const showcase = matched.get(live.id);
      const capability = showcase?.capabilities ?? {};
      return {
        ...live, name: clean(showcase?.displayName, 160) || live.name,
        description: clean(showcase?.description, 3000), category: clean(showcase?.category, 80), badge: clean(showcase?.badge, 80),
        showcased: Boolean(showcase), isPopular: showcase?.isPopular === true, sortOrder: showcase?.sortOrder ?? null,
        contextWindow: number(showcase?.contextWindow) ?? live.contextWindow,
        maxOutput: number(showcase?.maxOutput) ?? live.maxOutput,
        ...Object.fromEntries(['vision', 'reasoning', 'tools', 'search'].map(key => [key, typeof capability[key] === 'boolean' ? capability[key] : live[key]])),
        ...priceForModel(live, prices),
      };
    }).sort((a, b) => Number(b.showcased) - Number(a.showcased) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    return { models, updatedAt: new Date().toISOString(), available: true };
  } catch {
    return { models: [], updatedAt: new Date().toISOString(), available: false };
  }
}
