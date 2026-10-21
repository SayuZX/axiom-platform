import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const file = process.env.AXIOM_MAINTENANCE_FILE || 'C:/ProgramData/AxiomAi/maintenance/settings.json';
export const defaults = Object.freeze({ enabled: false, title: 'Pemeliharaan layanan AXIOM AI', message: 'Website dan akses model API sementara dihentikan untuk pemeliharaan. Periksa status di halaman ini sebelum melanjutkan penggunaan.', estimatedEnd: null, retryAfter: 300, updatedAt: null });
export function readMaintenance() {
  try { return { ...defaults, ...JSON.parse(readFileSync(file, 'utf8')) }; }
  catch (error) { if (error.code === 'ENOENT') return { ...defaults }; throw error; }
}
export function saveMaintenance(input) {
  const invalid = () => Object.assign(new Error('Konfigurasi maintenance tidak valid.'), { status: 400, code: 'invalid_maintenance' });
  if (!input || Object.keys(input).some(key => !['enabled', 'title', 'message', 'estimatedEnd', 'retryAfter'].includes(key)) || typeof input.enabled !== 'boolean' || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 2000 || !Number.isInteger(input.retryAfter) || input.retryAfter < 30 || input.retryAfter > 86400) throw invalid();
  if (input.estimatedEnd != null && (typeof input.estimatedEnd !== 'string' || !Number.isFinite(Date.parse(input.estimatedEnd)))) throw invalid();
  const settings = { enabled: input.enabled, title: input.title.trim(), message: input.message.trim(), estimatedEnd: input.estimatedEnd ? new Date(input.estimatedEnd).toISOString() : null, retryAfter: input.retryAfter, updatedAt: new Date().toISOString() };
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(settings), { mode: 0o600 });
  renameSync(temporary, file);
  return settings;
}
