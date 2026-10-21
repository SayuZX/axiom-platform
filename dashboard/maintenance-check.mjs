import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const directory = mkdtempSync(path.join(tmpdir(), 'axiom-maintenance-'));
process.env.AXIOM_MAINTENANCE_FILE = path.join(directory, 'settings.json');
try {
  const { readMaintenance, saveMaintenance, defaults } = await import('./lib/maintenance.mjs');
  assert.equal(readMaintenance().enabled, false);
  const { updatedAt, ...input } = defaults;
  const saved = saveMaintenance({ ...input, enabled: true, title: 'Perawatan AXIOM', estimatedEnd: '2026-10-19T10:00:00+07:00' });
  assert.equal(readMaintenance().enabled, true);
  assert.equal(saved.estimatedEnd, '2026-10-19T03:00:00.000Z');
  assert.throws(() => saveMaintenance({ ...input, enabled: 'true' }), { status: 400 });
  assert.throws(() => saveMaintenance({ ...input, retryAfter: -1 }), { status: 400 });
  assert.throws(() => saveMaintenance({ ...input, estimatedEnd: 'invalid' }), { status: 400 });
  assert.equal(readMaintenance().title, 'Perawatan AXIOM');
  saveMaintenance(input);
  assert.equal(readMaintenance().enabled, false);
  console.log('Maintenance persistence, validation, activation and recovery passed');
} finally { rmSync(directory, { recursive: true, force: true }); }
