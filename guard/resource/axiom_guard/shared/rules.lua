AxiomRules = {}
local R = AxiomRules

R.defaults = {
    mode = 'monitor', explosionLimit = 12, entityLimit = 35,
    particleLimit = 25, projectileLimit = 30, damageLimit = 500,
    heartbeatTimeout = 45
}

function R.finite(value)
    return type(value) == 'number' and value == value
        and value > -math.huge and value < math.huge
end

function R.elapsed(now, thenAt)
    return (now - thenAt) & 0xffffffff
end

function R.config(value)
    if type(value) ~= 'table' or (value.mode ~= 'monitor' and value.mode ~= 'protect') then
        return nil
    end
    local result = { mode = value.mode }
    for key in pairs(R.defaults) do
        if key ~= 'mode' then
            local n = value[key]
            local minimum = key == 'heartbeatTimeout' and 15 or 1
            local maximum = key == 'heartbeatTimeout' and 300 or (key == 'damageLimit' and 10000 or 1000)
            if not R.finite(n) or n % 1 ~= 0 or n < minimum or n > maximum then return nil end
            result[key] = n
        end
    end
    return result
end

-- Fixed ten-second windows begin with the first server-observed event.
-- Saturation bounds counter growth without allowing a flood through.
function R.hit(windows, rule, now, limit)
    local window = windows[rule]
    if not window or R.elapsed(now, window.at) >= 10000 then
        window = { at = now, count = 0 }
        windows[rule] = window
    end
    window.count = math.min(window.count + 1, 1000000000)
    return window.count > limit, window.count
end

function R.damage(data, limit)
    return type(data) == 'table' and data.overrideDefaultDamage == true
        and R.finite(data.weaponDamage) and data.weaponDamage > limit
end

function R.fresh(config, receivedAt, now)
    return receivedAt ~= nil and R.elapsed(now, receivedAt) < config.heartbeatTimeout * 1000
end

function R.cancel(exceeded, trust, config, receivedAt, now)
    return exceeded == true and trust == 'server' and config.mode == 'protect'
        and R.fresh(config, receivedAt, now)
end

function R.rule(policy, id)
    local rule = policy and policy.rules and policy.rules[id]
    if type(rule) ~= 'table' then return true, 'monitor' end
    local action = rule.action
    if action ~= 'cancel' and action ~= 'kick' and action ~= 'ban' then action = 'monitor' end
    return rule.enabled == true, action
end

local engineRules = {
    explosion_rate = true, entity_rate = true, particle_rate = true,
    projectile_rate = true, weapon_damage = true, entity_blacklist = true, weapon_blacklist = true
}

function R.action(policy, id, config, receivedAt, now, trust, exempt)
    local enabled, action = R.rule(policy, id)
    if not enabled or exempt then return 'none' end
    local engine = engineRules[id] == true
    for _, name in ipairs(policy and policy.engineRules or {}) do if name == id then engine = true; break end end
    if trust == 'client' then
        engine = false
        for _, name in ipairs(policy and policy.clientRules or {}) do if name == id then engine = true; break end end
    end
    if not engine or config.mode ~= 'protect' or not R.fresh(config, receivedAt, now) then return 'monitor' end
    if trust ~= 'server' and trust ~= 'client' then return 'monitor' end
    return action
end

function R.inZone(position, zones)
    if not position then return false end
    for _, zone in ipairs(zones or {}) do
        if R.finite(zone.x) and R.finite(zone.y) and R.finite(zone.z) and R.finite(zone.radius) then
            local x, y, z = position.x - zone.x, position.y - zone.y, position.z - zone.z
            if x * x + y * y + z * z <= zone.radius * zone.radius then return true end
        end
    end
    return false
end

function R.localBan(policy, ids, stamp)
    if type(policy) ~= 'table' then return nil end
    local permitted, lookup = {}, {}
    for _, entry in ipairs(policy.whitelist or {}) do
        if type(entry.expiresAt) ~= 'string' or entry.expiresAt > stamp then permitted[entry.uid] = true end
    end
    for _, id in ipairs(ids) do
        if id:match('^license:') or id:match('^license2:') or id:match('^steam:')
            or id:match('^fivem:') or id:match('^discord:') or id:match('^xbl:') or id:match('^live:') then lookup[id] = true end
    end
    for _, ban in ipairs(policy.bans or {}) do
        if not permitted[ban.uid] and (type(ban.expiresAt) ~= 'string' or ban.expiresAt > stamp) then
            for _, id in ipairs(ban.identifiers or {}) do if lookup[id] then return ban end end
        end
    end
end

function R.denyConnection(ban, config, receivedAt, now)
    return ban ~= nil and R.cancel(true, 'server', config, receivedAt, now)
end
