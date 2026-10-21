import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { serviceState, summaryState } from './health-state.mjs';

// Exercise the panel's actual derived state without mounting React or touching services.
const source = readFileSync(new URL('./page.jsx', import.meta.url), 'utf8');
const derived = source.slice(source.indexOf('  const checkedAt ='), source.indexOf('  return <DashboardShell'));
function check(services, options = {}) {
  const context = vm.createContext({
    data: { checkedAt: new Date().toISOString() }, services,
    resource: { loading: false, error: '' }, expired: false,
    maintenance: { enabled: false, receivedAt: Date.now() }, maintenanceError: '',
    FRESHNESS_MS: 60000, serviceState, summaryState,
    labels: { healthy: 'Operational', slow: 'Degraded', down: 'Outage', unknown: 'Belum diketahui' },
    ...options,
  });
  return vm.runInContext(derived + '\n({headline, unavailable});', context);
}
const up = { available: true, latencyMs: 10 }, down = { available: false, latencyMs: null };
assert.equal(check([up, up]).headline, 'Operational');
assert.equal(check([up, down]).headline, 'Degraded');
assert.equal(check([down, down]).headline, 'Outage');
assert.equal(check([]).headline, 'Belum diketahui');
assert.equal(check([up], { expired: true }).headline, 'Belum diketahui');
assert.equal(check([up], { resource: { loading: false, error: 'Unavailable' } }).headline, 'Belum diketahui');
assert.equal(check([up], { maintenance: { enabled: true, receivedAt: Date.now() } }).headline, 'Maintenance');
assert.equal(check([up], { maintenance: { enabled: true, receivedAt: 1 } }).headline, 'Belum diketahui');
assert.equal(check([up], { maintenanceError: 'Unavailable' }).headline, 'Belum diketahui');
console.log('Panel health: operational, degraded, outage, maintenance, missing, stale and error passed.');
