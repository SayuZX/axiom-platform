import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCfx, summarizeFiveM } from './health.mjs';

const names = ['Authentication', 'FiveM', 'RedM', 'Community Servers', 'Marketplace'];
const section = (group, statuses, serviceNames = names) => `<div><h6 data-testid="status-section-heading">${group}</h6><div>${serviceNames.map((name, index) => `<div><p data-testid="status-item-${index}" aria-label="${name}">${name}</p><span>${statuses[index] ?? 'All services operational'}</span></div>`).join('')}</div></div>`;

test('Cfx parser isolates the official group and never turns incomplete or unfamiliar status into green', () => {
  const unrelated = section('Grand Theft Auto Online', ['All services operational']);
  assert.equal(summarizeCfx(unrelated).state, 'unknown');
  assert.equal(summarizeCfx(unrelated + section('Cfx', ['All services operational', 'There are partial outages'])).state, 'degraded');
  const outage = summarizeCfx(section('Cfx', ['All services are down']));
  assert.equal(outage.state, 'outage');
  assert.equal(outage.components.find((item) => item.name === 'Authentication').state, 'outage');
  assert.equal(summarizeCfx(section('Cfx', [], names.slice(1))).state, 'unknown');
  assert.equal(summarizeCfx(section('Cfx', ['An unfamiliar status'])).state, 'unknown');
  assert.equal(summarizeCfx(section('Cfx', []) + section('Cfx', [])).state, 'unknown');
  const operational = summarizeCfx(section('Cfx', []));
  assert.equal(operational.state, 'operational');
  assert.equal(operational.updatedAt, null);
});

test('FiveM distinguishes absent service, partial responses and invalid player counts', () => {
  const absent = { ok: false, received: false, unreachable: true };
  const info = { ok: true, received: true, data: { server: 'FXServer', vars: {} } };
  const dynamic = { ok: true, received: true, data: { clients: 0, sv_maxclients: '48', hostname: 'AXIOM' } };
  assert.equal(summarizeFiveM(absent, absent, 10).state, 'offline');
  assert.equal(summarizeFiveM(absent, absent, 10).players, null);
  assert.equal(summarizeFiveM(info, absent, 10).state, 'degraded');
  assert.equal(summarizeFiveM(info, absent, 10).players, null);
  assert.equal(summarizeFiveM(info, dynamic, 10).state, 'online');
  assert.equal(summarizeFiveM(info, dynamic, 10).players, 0);
  const invalid = summarizeFiveM(info, { ...dynamic, data: { ...dynamic.data, clients: 49 } }, 10);
  assert.equal(invalid.state, 'degraded');
  assert.equal(invalid.players, null);
  assert.equal(summarizeFiveM({ ok: false, received: true }, absent, 10).state, 'degraded');
  assert.equal(summarizeFiveM({ ok: false }, { ok: false }, 10).state, 'unknown');
});
