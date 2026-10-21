// JavaScript, request-quotas.cjs, Node.js 24: shared SQLite request-count quotas.
'use strict';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const WIB = 7 * HOUR;
const initialized = new WeakSet();
const fields = {
  key: { threeHourRequestLimit: 'threeHour', weeklyRequestLimit: 'weekly' },
  account: { dailyRequestLimit: 'daily' }
};

function init(db) {
  if (initialized.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS requestQuotas (
    scope TEXT NOT NULL CHECK (scope IN ('key', 'account')),
    subjectId TEXT NOT NULL,
    period TEXT NOT NULL,
    requestLimit INTEGER NOT NULL DEFAULT 0
      CHECK (typeof(requestLimit) = 'integer' AND requestLimit BETWEEN 0 AND 9007199254740991),
    used INTEGER NOT NULL DEFAULT 0
      CHECK (typeof(used) = 'integer' AND used BETWEEN 0 AND 9007199254740991),
    startedAt INTEGER,
    resetAt INTEGER,
    PRIMARY KEY (scope, subjectId, period),
    CHECK ((scope = 'key' AND period IN ('threeHour', 'weekly'))
      OR (scope = 'account' AND period = 'daily'))
  )`);
  // A caller may roll back schema creation inside its own transaction.
  if (!db.isTransaction) initialized.add(db);
}

function validateSubject(scope, id) {
  if (scope !== 'key' && scope !== 'account') throw new TypeError('Invalid request quota scope');
  if (typeof id !== 'string' || !id.length) throw new TypeError('Request quota subject ID must be a nonempty string');
}

function validateTime(now) {
  if (!Number.isSafeInteger(now)) throw new TypeError('Request quota time must be an integer epoch millisecond');
}

function windowFor(period, row, now) {
  if (period === 'threeHour') {
    return row?.startedAt != null && row.resetAt > now
      ? { used: row.used, startedAt: row.startedAt, resetAt: row.resetAt }
      : { used: 0, startedAt: null, resetAt: null };
  }
  const day = Math.floor((now + WIB) / DAY);
  // Epoch day zero was Thursday; WIB has no daylight-saving transitions.
  const startedAt = (period === 'daily' ? day : day - ((day + 3) % 7 + 7) % 7) * DAY - WIB;
  const resetAt = startedAt + (period === 'daily' ? DAY : WEEK);
  return {
    used: row?.startedAt === startedAt && row.resetAt === resetAt ? row.used : 0,
    startedAt,
    resetAt
  };
}

function readLimits(db, scope, id, now = Date.now()) {
  validateSubject(scope, id);
  validateTime(now);
  init(db);
  const rows = db.prepare('SELECT period, requestLimit, used, startedAt, resetAt FROM requestQuotas WHERE scope = ? AND subjectId = ?').all(scope, id);
  const result = { requestUsage: {} };
  for (const [field, period] of Object.entries(fields[scope])) {
    const row = rows.find(item => item.period === period);
    const limit = row?.requestLimit ?? 0;
    const window = windowFor(period, row, now);
    result[field] = limit;
    result.requestUsage[period] = {
      limit,
      used: window.used,
      remaining: limit === 0 ? null : Math.max(0, limit - window.used),
      resetAt: window.resetAt === null ? null : new Date(window.resetAt).toISOString()
    };
  }
  return result;
}

function setLimits(db, scope, id, input) {
  validateSubject(scope, id);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    throw new TypeError('Request quota limits must be an object');
  }
  const entries = Reflect.ownKeys(input).map(field => {
    if (!Object.hasOwn(fields[scope], field)) throw new TypeError(`Unknown request quota field: ${String(field)}`);
    const value = input[field];
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a nonnegative safe integer`);
    return [scope, id, fields[scope][field], value];
  });
  init(db);
  if (entries.length) {
    // One atomic statement also works inside the billing caller's transaction.
    db.prepare(`INSERT INTO requestQuotas (scope, subjectId, period, requestLimit)
      VALUES ${entries.map(() => '(?, ?, ?, ?)').join(', ')}
      ON CONFLICT (scope, subjectId, period) DO UPDATE SET requestLimit = excluded.requestLimit
      WHERE requestQuotas.requestLimit != excluded.requestLimit`).run(...entries.flat());
  }
  return readLimits(db, scope, id);
}

function consume(db, subjects, now = Date.now()) {
  validateTime(now);
  if (!Array.isArray(subjects)) throw new TypeError('Request quota subjects must be an array');
  const unique = new Map();
  for (const subject of subjects) {
    if (!subject || typeof subject !== 'object') throw new TypeError('Invalid request quota subject');
    const { scope, id, period } = subject;
    validateSubject(scope, id);
    if (!Object.values(fields[scope]).includes(period)) throw new TypeError('Invalid request quota period');
    unique.set(JSON.stringify([scope, id, period]), { scope, id, period });
  }
  init(db);
  if (!unique.size) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const select = db.prepare('SELECT requestLimit, used, startedAt, resetAt FROM requestQuotas WHERE scope = ? AND subjectId = ? AND period = ?');
    const pending = [];
    let exhausted = null;
    for (const subject of unique.values()) {
      const row = select.get(subject.scope, subject.id, subject.period);
      if (!row || row.requestLimit === 0) continue;
      const window = windowFor(subject.period, row, now);
      if (window.used >= row.requestLimit) {
        if (!exhausted || window.resetAt > exhausted.resetAt) exhausted = { ...subject, resetAt: window.resetAt };
      } else {
        pending.push({ ...subject, ...window });
      }
    }
    if (exhausted) {
      const period = { threeHour: '3 jam', daily: 'harian', weekly: 'mingguan' }[exhausted.period];
      const subject = exhausted.scope === 'account' ? 'akun provider' : 'API key';
      const resetWib = new Date(exhausted.resetAt + WIB).toISOString().slice(0, 19).replace('T', ' ');
      throw Object.assign(new Error(`Limit request ${period} ${subject} kamu telah tercapai. Kuota reset pada ${resetWib} WIB. Silakan coba lagi setelah waktu tersebut.`), {
        status: 429,
        code: 'request_limit_exceeded',
        retryAfter: Math.max(1, Math.ceil((exhausted.resetAt - now) / 1000)),
        resetAt: new Date(exhausted.resetAt).toISOString(),
        quotaScope: exhausted.scope,
        quotaPeriod: exhausted.period
      });
    }
    if (pending.length) {
      const update = db.prepare('UPDATE requestQuotas SET used = ?, startedAt = ?, resetAt = ? WHERE scope = ? AND subjectId = ? AND period = ?');
      for (const subject of pending) {
        update.run(subject.used + 1, subject.startedAt ?? now, subject.resetAt ?? now + 3 * HOUR,
          subject.scope, subject.id, subject.period);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Request quota rollback failed');
    }
    throw error;
  }
}

module.exports = { init, readLimits, setLimits, consume };
