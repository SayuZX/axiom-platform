'use strict';
const assert = require('node:assert/strict');
const { mergeRoute } = require('../../../operations/configure-tunnel.cjs');
const route = require('../../../operations/tunnel-route.json');
const existing = {
  ingress: [
    { hostname: 'other.axiomcreative.xyz', service: 'http://127.0.0.1:4000' },
    { service: 'http_status:503' },
  ],
  'warp-routing': { enabled: true },
};
const merged = mergeRoute(existing, route);
assert.deepEqual(merged.ingress[0], existing.ingress[0]);
assert.equal(merged.ingress[1].hostname, 'portal.axiomcreative.xyz');
assert.equal(merged.ingress[1].service, 'http://127.0.0.1:3084');
assert.equal(merged.ingress.at(-1).service, 'http_status:503');
assert.deepEqual(merged['warp-routing'], { enabled: true });
assert.equal(existing.ingress.length, 2, 'planning must not mutate source config');
assert.deepEqual(mergeRoute(merged, route), merged, 'repeated route configuration is idempotent');
assert.throws(() => mergeRoute({ ingress: [{ hostname: route.hostname, path: '/admin', service: 'http://127.0.0.1:9000' }, { service: 'http_status:404' }] }, route), /path-specific/);
assert.throws(() => mergeRoute({ ingress: [{ hostname: 'other.example', service: 'http://127.0.0.1:8000' }] }, route), /catch-all/);
console.log('PASS: scoped Tunnel route, preserved unrelated ingress, idempotence, conflicting path refusal');
