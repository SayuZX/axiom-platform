import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./page.jsx', import.meta.url), 'utf8');
const derived = source.slice(source.indexOf('  const latencyRows ='), source.indexOf('  return <DashboardShell'));
function check(data) {
  return vm.runInNewContext(derived + '\n({latencyRows, maxLatency});', { data });
}
const result = check({ usage: [0, 120, 480, -1, null, undefined, NaN, Infinity, -Infinity, '120'].map(averageTotalMs => ({ averageTotalMs })) });
assert.deepEqual(Array.from(result.latencyRows, row => row.averageTotalMs), [0, 120, 480]);
assert.equal(result.maxLatency, 480);
assert.equal(result.latencyRows[1].averageTotalMs / result.maxLatency * 100, 25);
assert.equal(check(undefined).latencyRows.length, 0);
assert.equal(check({ usage: [] }).maxLatency, 0);
const zero = check({ usage: [{ averageTotalMs: 0 }] });
assert.equal(zero.latencyRows.length, 1);
assert.equal(zero.maxLatency ? zero.latencyRows[0].averageTotalMs / zero.maxLatency * 100 : 0, 0);
console.log('Historical request duration: valid values, scaling, missing data and zero passed.');
