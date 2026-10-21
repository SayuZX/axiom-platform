import { PUBLIC_ORIGIN, requireOrigin, routerAdmin, bodyJson, json, fail } from '../../../lib/merchant-http.mjs';
import { getSiteCatalog, getLiveModels, invalidateSiteCatalog } from '../../../lib/site-catalog.mjs';
import { showcaseRecords, matchShowcase, saveShowcase, deleteShowcase, saveModelPricing } from '../../../lib/model-store.mjs';
import { readMaintenance, saveMaintenance } from '../../../lib/maintenance.mjs';
import { routerDb } from '../../../lib/merchant-commerce.mjs';
import { initializeAnnouncements, listAnnouncements, saveAnnouncement } from '../../../lib/announcements.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminOrigin(request) {
  if (request.method !== 'GET') return requireOrigin(request);
  const origin = request.headers.get('origin');
  let refererOrigin;
  try { refererOrigin = new URL(request.headers.get('referer')).origin; } catch {}
  if ((origin && origin !== PUBLIC_ORIGIN) || (!origin && refererOrigin !== PUBLIC_ORIGIN) || request.headers.get('sec-fetch-site') === 'cross-site') throw fail(403, 'Origin permintaan tidak diizinkan.', 'origin_denied');
}
async function handle(request, context) {
  try {
    adminOrigin(request);
    if (!await routerAdmin(request)) throw fail(401, 'Login administrator situs diperlukan.', 'admin_required');
    const { path } = await context.params;
    const route = path.join('/');
    if (route === 'announcements') {
      const db = routerDb(); initializeAnnouncements(db);
      if (request.method === 'GET') return json({ items: listAnnouncements(db, 'admin') });
      if (request.method === 'POST') return json({ item: saveAnnouncement(db, await bodyJson(request)) });
    }
    if (route === 'maintenance') {
      if (request.method === 'GET') return json(readMaintenance());
      if (request.method === 'POST') return json(saveMaintenance(await bodyJson(request)));
    }
    if (request.method === 'GET') {
      if (route === 'models') {
        let liveModels = [], available = true;
        try { liveModels = await getLiveModels({ fresh: true }); } catch { available = false; }
        const models = showcaseRecords().map(row => {
          const live = matchShowcase(row, liveModels);
          return { ...row, matched: Boolean(live), liveId: live?.id ?? null, published: Boolean(live && row.isActive) };
        });
        return json({ models, liveModels, available, updatedAt: new Date().toISOString() });
      }
      if (route === 'pricing') {
        const catalog = await getSiteCatalog();
        return json(catalog, catalog.available ? 200 : 503);
      }
    }
    if (request.method === 'POST') {
      const input = await bodyJson(request);
      let result;
      if (path.length === 3 && path[0] === 'models' && path[2] === 'delete') {
        if (Object.keys(input).length) throw fail(400, 'Isi permintaan hapus harus kosong.', 'invalid_model');
        result = deleteShowcase(path[1]);
      } else if (path[0] === 'models' && path.length <= 2) {
        let liveModels = [];
        try { liveModels = await getLiveModels({ fresh: true }); } catch (error) { if (path.length === 1) throw error; }
        result = saveShowcase(input, liveModels, path[1]);
      } else if (route === 'pricing') {
        result = saveModelPricing(input, await getLiveModels({ fresh: true }));
      } else throw fail(404, 'Rute model tidak ditemukan.', 'not_found');
      invalidateSiteCatalog();
      return json(result, route === 'models' ? 201 : 200);
    }
    throw fail(404, 'Rute model tidak ditemukan.', 'not_found');
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
    return json({ error: error?.status ? error.message : 'Layanan model sementara tidak tersedia.', code: error?.status ? error.code : 'model_unavailable' }, status);
  }
}
export const GET = handle;
export const POST = handle;
