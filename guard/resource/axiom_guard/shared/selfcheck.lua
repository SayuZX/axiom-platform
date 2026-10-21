-- Pure assertions: no native events, players, config mutations or telemetry.
-- Standalone: lua -e 'dofile("rules.lua"); dofile("selfcheck.lua"); print(AxiomSelfcheck())'
function AxiomSelfcheck()
    local R = AxiomRules
    local windows = {}
    for _ = 1, 12 do assert(not R.hit(windows, 'explosion', 0, 12), 'threshold equality') end
    assert(R.hit(windows, 'explosion', 0, 12), 'threshold overflow')
    assert(R.hit(windows, 'explosion', 9999, 12), 'window held')
    assert(not R.hit(windows, 'explosion', 10000, 12), 'window reset')
    assert(not R.hit(windows, 'entity', 10000, 35), 'independent rules')
    assert(not R.damage({ overrideDefaultDamage = false, weaponDamage = 9999 }, 500), 'default damage')
    assert(not R.damage({ overrideDefaultDamage = true, weaponDamage = 500 }, 500), 'damage equality')
    assert(R.damage({ overrideDefaultDamage = true, weaponDamage = 501 }, 500), 'damage overflow')
    assert(not R.damage({ overrideDefaultDamage = true, weaponDamage = 0 / 0 }, 500), 'nonfinite damage')
    local config = R.config(R.defaults)
    assert(config and not R.config({ mode = 'protect' }), 'atomic config')
    assert(not R.cancel(true, 'server', config, 0, 0), 'monitor never cancels')
    config.mode = 'protect'
    assert(R.cancel(true, 'server', config, 0, 44999), 'fresh protect')
    assert(not R.cancel(true, 'server', config, 0, 45000), 'stale boundary')
    assert(not R.cancel(true, 'server', config, nil, 0), 'unconfigured protect')
    assert(not R.cancel(true, 'client', config, 0, 0), 'client never enforces')
    assert(not R.cancel(false, 'server', config, 0, 0), 'safe event never cancels')
    assert(R.elapsed(10, 0xfffffff0) == 26, 'timer wrap')
    local enabled, action = R.rule({ rules = { entity_rate = { enabled = false, action = 'cancel' } } }, 'entity_rate')
    assert(not enabled and action == 'cancel', 'disabled rule stays disabled')
    local rules = { rules = { entity_rate = { enabled = true } } }
    for _, requested in ipairs({ 'monitor', 'cancel', 'kick', 'ban' }) do
        rules.rules.entity_rate.action = requested
        config.mode = 'protect'
        assert(R.action(rules, 'entity_rate', config, 0, 44999, 'server') == requested, 'fresh action: ' .. requested)
        assert(R.action(rules, 'entity_rate', config, 0, 45000, 'server') == 'monitor', 'stale action boundary')
        assert(R.action(rules, 'entity_rate', config, nil, 0, 'server') == 'monitor', 'startup action')
        assert(R.action(rules, 'entity_rate', config, 0, 0, 'client') == 'monitor', 'client action')
        assert(R.action(rules, 'entity_rate', config, 0, 0, 'server', true) == 'none', 'exempt action')
        config.mode = 'monitor'
        assert(R.action(rules, 'entity_rate', config, 0, 0, 'server') == 'monitor', 'monitor action')
        rules.rules.entity_rate.enabled = false
        assert(R.action(rules, 'entity_rate', config, 0, 0, 'server') == 'none', 'disabled action')
        rules.rules.entity_rate.enabled = true
    end
    config.mode = 'protect'
    for _, id in ipairs({ 'client_observation', 'heartbeat_missing', 'movement_observation', 'custom_rule' }) do
        rules.rules[id] = { enabled = true, action = 'ban' }
        assert(R.action(rules, id, config, 0, 0, 'server') == 'monitor', 'observer-only: ' .. id)
    end
    assert(R.action(nil, 'entity_rate', config, 0, 0, 'server') == 'monitor', 'missing policy')
    rules.rules.entity_rate.action = 'invalid'
    assert(R.action(rules, 'entity_rate', config, 0, 0, 'server') == 'monitor', 'invalid action')
    rules.rules.entity_rate.action = 'kick'
    assert(R.action(rules, 'entity_rate', config, 0xfffffff0, 10, 'server') == 'kick', 'fresh action across timer wrap')
    for _, id in ipairs({ 'explosion_rate', 'particle_rate', 'projectile_rate', 'weapon_damage', 'entity_blacklist', 'weapon_blacklist' }) do
        rules.rules[id] = { enabled = true, action = 'cancel' }
        assert(R.action(rules, id, config, 0, 0, 'server') == 'cancel', 'engine action: ' .. id)
    end
    assert(R.inZone({ x = 3, y = 4, z = 0 }, {{ x = 0, y = 0, z = 0, radius = 5 }}), 'zone boundary')
    assert(not R.inZone({ x = 3, y = 4, z = 1 }, {{ x = 0, y = 0, z = 0, radius = 5 }}), 'zone altitude')
    local ban = { id = 1, uid = 'test', identifiers = { 'license:abc', 'ip:127.0.0.1' } }
    local policy = { bans = { ban }, whitelist = {} }
    assert(R.localBan(policy, { 'license:abc' }, '2026-01-01') == ban, 'strong ban identity')
    assert(not R.denyConnection(nil, config, 0, 0), 'no ban never denies')
    assert(R.denyConnection(ban, config, 0, 44999), 'fresh protect connection ban')
    assert(not R.denyConnection(ban, config, 0, 45000), 'stale ban fails open')
    assert(not R.denyConnection(ban, config, nil, 0), 'startup ban fails open')
    config.mode = 'monitor'
    assert(not R.denyConnection(ban, config, 0, 0), 'monitor ban only observes')
    assert(not R.localBan(policy, { 'ip:127.0.0.1' }, '2026-01-01'), 'IP never bans')
    policy.whitelist = {{ uid = 'test', expiresAt = '2026-02-01' }}
    assert(not R.localBan(policy, { 'license:abc' }, '2026-01-01'), 'active whitelist')
    assert(R.localBan(policy, { 'license:abc' }, '2026-02-01') == ban, 'whitelist expiry boundary')
    ban.expiresAt = '2026-02-01'
    assert(not R.localBan(policy, { 'license:abc' }, '2026-02-01'), 'ban expiry boundary')
    if AxiomScripts then
        local ok, result = AxiomScripts.apply({ operations = {}, result = 42 }, 0)
        assert(ok and result.result == 42, 'script result receipt')
        ok = AxiomScripts.apply({ operations = {{ type = 'teleport', x = 0/0, y = 0, z = 0 }} }, 0)
        assert(not ok, 'script operation validation')
    end
    return 'PASS: thresholds, windows, damage, monitor/cancel/kick/ban decisions, stale/client/exempt safety, local bans; no native actions or events executed'
end
