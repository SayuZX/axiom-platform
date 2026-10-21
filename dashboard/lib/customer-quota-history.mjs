import { routerDb } from './merchant-commerce.mjs';
import { merchantDb } from './merchant-store.mjs';
import { fail } from './merchant-http.mjs';

const installed = new WeakSet();

export function installQuotaHistory(db) {
  if (installed.has(db)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='axiom_quota_history'").get();
    db.exec(`CREATE TABLE IF NOT EXISTS axiom_quota_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id TEXT NOT NULL,
      key_name TEXT,
      key_suffix TEXT,
      package_name TEXT,
      token_limit INTEGER NOT NULL,
      tokens_used INTEGER NOT NULL,
      exhausted_at TEXT,
      recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS axiom_quota_history_key ON axiom_quota_history(api_key_id,id);
    CREATE TRIGGER IF NOT EXISTS axiom_quota_history_insert AFTER INSERT ON apiKeys
    WHEN NEW.tokenLimit > 0 AND NEW.tokensUsed >= NEW.tokenLimit
    BEGIN
      INSERT INTO axiom_quota_history(api_key_id,key_name,key_suffix,package_name,token_limit,tokens_used,exhausted_at)
      VALUES(NEW.id,NEW.name,substr(NEW.key,-4),(SELECT name FROM tokenPackages WHERE id=NEW.packageId),NEW.tokenLimit,NEW.tokensUsed,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;
    CREATE TRIGGER IF NOT EXISTS axiom_quota_history_update AFTER UPDATE OF tokenLimit,tokensUsed ON apiKeys
    WHEN NEW.tokenLimit > 0 AND NEW.tokensUsed >= NEW.tokenLimit
      AND NOT COALESCE(OLD.tokenLimit > 0 AND OLD.tokensUsed >= OLD.tokenLimit,0)
    BEGIN
      INSERT INTO axiom_quota_history(api_key_id,key_name,key_suffix,package_name,token_limit,tokens_used,exhausted_at)
      VALUES(NEW.id,NEW.name,substr(NEW.key,-4),(SELECT name FROM tokenPackages WHERE id=NEW.packageId),NEW.tokenLimit,NEW.tokensUsed,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    END;`);
    // Table creation and seed commit together: later installs never invent another exhaustion.
    if (!existing) db.exec(`INSERT INTO axiom_quota_history(api_key_id,key_name,key_suffix,package_name,token_limit,tokens_used,exhausted_at)
      SELECT k.id,k.name,substr(k.key,-4),p.name,k.tokenLimit,k.tokensUsed,NULL
      FROM apiKeys k LEFT JOIN tokenPackages p ON p.id=k.packageId
      WHERE k.tokenLimit > 0 AND k.tokensUsed >= k.tokenLimit`);
    db.exec('COMMIT');
    installed.add(db);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export async function customerQuotaHistory(customer, search) {
  if (!customer?.id) throw fail(401, 'Masuk ke akun AXIOM terlebih dahulu.', 'customer_login_required');
  const pages = search.getAll('page');
  const rawPage = pages[0] ?? '1';
  const requestedPage = Number(rawPage);
  if (pages.length > 1 || !/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(requestedPage) || requestedPage > 100000) {
    throw fail(400, 'Halaman riwayat kuota tidak valid.', 'invalid_filter');
  }
  const [rows] = await merchantDb().execute('SELECT DISTINCT api_key_id FROM bridge_checkout WHERE customer_id=? AND api_key_id IS NOT NULL', [customer.id]);
  const ids = JSON.stringify(rows.map(row => row.api_key_id));
  const db = routerDb();
  installQuotaHistory(db);
  const size = 25;
  const scope = 'FROM axiom_quota_history WHERE api_key_id IN (SELECT value FROM json_each(?))';
  // Read count and page from one snapshot while router workers append events.
  db.exec('BEGIN');
  try {
    const { total } = db.prepare(`SELECT COUNT(*) AS total ${scope}`).get(ids);
    const totalPages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(requestedPage, totalPages);
    const events = db.prepare(`SELECT id,key_name AS keyName,key_suffix AS keySuffix,package_name AS packageName,
      token_limit AS tokenLimit,tokens_used AS tokensUsed,exhausted_at AS exhaustedAt,recorded_at AS recordedAt
      ${scope} ORDER BY id DESC LIMIT ? OFFSET ?`).all(ids, size, (page - 1) * size);
    db.exec('COMMIT');
    return { events, page, totalPages, total, checkedAt: new Date().toISOString() };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
