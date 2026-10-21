import { randomUUID } from 'node:crypto';

export const categories = ['NEW', 'UPDATE', 'FIX', 'MAINTENANCE', 'PRICING', 'SECURITY'];
export const serviceStages = ['investigating', 'fixing', 'monitoring', 'resolved'];
const invalid = message => Object.assign(new Error(message), { status: 400, code: 'invalid_announcement' });
const secret = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\b(?:sk|thk_live|ghp|github_pat)[_-][A-Za-z0-9_-]{8,}|\b(?:api[_ -]?key|password|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/i;
export function initializeAnnouncements(db) {
  // Extend, never alter, the API notice schema: gateway SELECT * normalization stays compatible.
  db.exec(`CREATE TABLE IF NOT EXISTS axiom_announcement_details (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL,
    content TEXT NOT NULL, version TEXT NOT NULL, audience TEXT NOT NULL,
    published_at INTEGER, updated_at INTEGER NOT NULL, is_pinned INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS axiom_announcement_progress (
    id TEXT PRIMARY KEY, stage TEXT NOT NULL CHECK(stage IN ('investigating','fixing','monitoring','resolved')),
    updated_at INTEGER NOT NULL
  )`);
}
function text(value, name, max, optional = false) {
  if (optional && value == null) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || secret.test(value)) throw invalid(`${name} tidak valid atau mengandung kredensial.`);
  return value.trim();
}
function date(value, name) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid(`${name} harus timestamp dengan zona waktu.`);
  return Date.parse(value);
}
export function saveAnnouncement(db, input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Objek pengumuman diperlukan.');
  const allowed = new Set(['id','title','slug','category','summary','content','version','status','published_at','updated_at','expires_at','audience','is_pinned','publish_to_api','service_stage']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw invalid('Field pengumuman tidak dikenal.');
  if (input.service_stage !== undefined && input.service_stage !== null && !serviceStages.includes(input.service_stage)) throw invalid('Tahap layanan tidak valid.');
  if (input.id !== undefined && (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.id))) throw invalid('ID tidak valid.');
  const id = input.id ?? randomUUID();
  const title = text(input.title, 'Judul', 120), summary = text(input.summary, 'Ringkasan', 1600), content = text(input.content, 'Konten', 20000), version = text(input.version, 'Versi', 40, true);
  const slug = text(input.slug, 'Slug', 160);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !categories.includes(input.category) || !['draft','published'].includes(input.status) || !['public','customers'].includes(input.audience) || typeof input.is_pinned !== 'boolean' || (input.publish_to_api !== undefined && typeof input.publish_to_api !== 'boolean')) throw invalid('Kategori, status, audience, slug, atau konfigurasi tidak valid.');
  const published = date(input.published_at, 'Waktu publikasi'), expires = date(input.expires_at, 'Waktu kedaluwarsa');
  if (input.status === 'published' && published === null) throw invalid('Waktu publikasi wajib diisi.');
  if (expires !== null && (published === null || expires <= published)) throw invalid('Kedaluwarsa harus sesudah publikasi.');
  const api = input.publish_to_api === true;
  if (api && (input.audience !== 'public' || /[^\x20-\x7e]/.test(title + summary))) throw invalid('Banner API memerlukan audience publik dan judul/ringkasan ASCII satu baris sesuai protokol gateway.');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (input.id && !db.prepare('SELECT id FROM axiom_announcement_details WHERE id=?').get(id)) throw Object.assign(new Error('Pengumuman tidak ditemukan.'), {status:404});
    if (!input.id && db.prepare('SELECT notice_id FROM axiom_notices WHERE notice_id=?').get(id)) throw invalid('ID sudah digunakan.');
    const stage = input.service_stage === undefined ? db.prepare('SELECT stage FROM axiom_announcement_progress WHERE id=?').get(id)?.stage ?? null : input.service_stage;
    if (stage !== null && input.category === 'PRICING') throw invalid('Kategori PRICING tidak dapat melacak tahap layanan.');
    db.prepare(`INSERT INTO axiom_notices(notice_id,enabled,mode,target,target_group,event_type,priority,start_at,expires_at,title,message) VALUES(?,?,?,'all',NULL,?,?,?,?,?,?) ON CONFLICT(notice_id) DO UPDATE SET enabled=excluded.enabled,mode=excluded.mode,event_type=excluded.event_type,priority=excluded.priority,start_at=excluded.start_at,expires_at=excluded.expires_at,title=excluded.title,message=excluded.message`).run(id, Number(input.status === 'published'), api ? 'always' : 'disabled', ['MAINTENANCE','PRICING'].includes(input.category) ? input.category : 'UPDATE', Number(input.is_pinned), published, expires, title, summary);
    db.prepare(`INSERT INTO axiom_announcement_details VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,category=excluded.category,content=excluded.content,version=excluded.version,audience=excluded.audience,published_at=excluded.published_at,updated_at=excluded.updated_at,is_pinned=excluded.is_pinned`).run(id,slug,input.category,content,version,input.audience,published,now,Number(input.is_pinned));
    if (stage === null) db.prepare('DELETE FROM axiom_announcement_progress WHERE id=?').run(id);
    else db.prepare(`INSERT INTO axiom_announcement_progress(id,stage,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET stage=excluded.stage,updated_at=excluded.updated_at WHERE stage!=excluded.stage`).run(id,stage,now);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); if (String(error.code).includes('CONSTRAINT')) throw invalid('Slug sudah digunakan.'); throw error; }
  return listAnnouncements(db, 'admin', now).find(item => item.id === id);
}
export function listAnnouncements(db, audience = 'public', now = Date.now()) {
  if (!['public','customers','admin'].includes(audience)) throw invalid('Audience tidak valid.');
  const rows = db.prepare(`SELECT d.*,n.title,n.message,n.enabled,n.mode,n.expires_at${audience === 'admin' ? ',p.stage AS service_stage' : ''} FROM axiom_announcement_details d JOIN axiom_notices n ON n.notice_id=d.id ${audience === 'admin' ? 'LEFT JOIN axiom_announcement_progress p ON p.id=d.id' : "WHERE n.enabled=1 AND d.published_at<=? AND (n.expires_at IS NULL OR n.expires_at>?)" + (audience === 'public' ? " AND d.audience='public'" : '')} ORDER BY d.published_at DESC,d.updated_at DESC,d.id`).all(...(audience === 'admin' ? [] : [now,now]));
  return rows.map(row => ({id:row.id,title:row.title,slug:row.slug,category:row.category,summary:row.message,content:row.content,version:row.version,status:row.enabled ? 'published':'draft',published_at:row.published_at === null ? null:new Date(row.published_at).toISOString(),updated_at:new Date(row.updated_at).toISOString(),expires_at:row.expires_at === null ? null:new Date(row.expires_at).toISOString(),audience:row.audience,is_pinned:Boolean(row.is_pinned),...(audience === 'admin' ? {publish_to_api:row.mode !== 'disabled',service_stage:row.service_stage ?? null} : {})}));
}
