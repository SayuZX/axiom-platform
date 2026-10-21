local B, R = AxiomBackend, AxiomRules
local raw = LoadResourceFile(GetCurrentResourceName(), 'shared/catalog.json')
local decoded, catalog = pcall(json.decode, raw or '')
assert(decoded and type(catalog) == 'table' and type(catalog.catalog) == 'table' and type(catalog.catalog.tabs) == 'table', 'AXIOM shared/catalog.json is missing or invalid')
local fields, initial = {}, {}
for _, tab in ipairs(catalog.catalog.tabs) do
    for _, field in ipairs(tab.fields) do fields[field.key] = field; initial[field.key] = B.copy(field.default) end
end
B.catalog, B.fields = catalog, fields

local baseNames = { 'explosion_rate', 'entity_rate', 'particle_rate', 'projectile_rate', 'weapon_damage', 'weapon_blacklist', 'entity_blacklist', 'client_observation', 'heartbeat_missing', 'movement_observation' }
local observed = { client_observation = true, heartbeat_missing = true, movement_observation = true }
local function policyDefaults()
    local policy = { rules = {}, weapons = {}, entities = {}, allowedWeapons = {}, allowedEntities = {}, adminBypass = false, zones = {}, movementSpeed = 150 }
    for _, key in ipairs(baseNames) do policy.rules[key] = { enabled = true, action = observed[key] and 'monitor' or 'cancel' } end
    return policy
end
local function has(items, value)
    for _, item in ipairs(items or {}) do if item == value then return true end end
    return false
end
local function finite(value) return R.finite(value) end
local function object(value)
    if type(value) ~= 'table' then return false end
    for key in pairs(value) do if type(key) ~= 'string' then return false end end
    return true
end

local function zones(value)
    if not B.array(value, 32) then return false end
    for _, zone in ipairs(value) do
        if not object(zone) or not B.text(zone.name, 64) or not finite(zone.x) or not finite(zone.y) or not finite(zone.z)
            or not finite(zone.radius) or zone.radius < 1 or zone.radius > 10000
            or math.max(math.abs(zone.x), math.abs(zone.y), math.abs(zone.z)) > 100000 then return false end
    end
    return true
end

function B.validateValue(key, value, importing)
    local field = fields[key]
    if not field then return nil, 'Unknown control: ' .. tostring(key) end
    if type(field.unavailable) == 'string' and not importing then return nil, field.unavailable end
    if key == 'QBCore resource' or key == 'ESX resource' or key == 'Qbox resource' or key == 'Inventory resource' then
        if type(value) ~= 'string' or #value > 64 or not value:match('^[%w_][%w_.%-]*$') then return nil, 'Invalid framework resource name' end
    end
    local valid = false
    if field.type == 'boolean' then valid = type(value) == 'boolean'
    elseif field.type == 'number' then valid = finite(value) and value >= field.min and value <= field.max
    elseif field.type == 'select' then valid = has(field.options, value)
    elseif field.type == 'text' then valid = B.text(value, 2048)
    elseif field.type == 'array' then
        valid = B.array(value, 256)
        if valid then
            for _, item in ipairs(value) do
                if not ((type(item) == 'string' and B.text(item, 128)) or (finite(item) and #tostring(item) <= 128)) then valid = false; break end
            end
        end
    elseif field.type == 'object' then
        if key == 'Detection settings' then
            valid = object(value)
            local count = 0
            if valid then
                for name, setting in pairs(value) do
                    count = count + 1
                    local target = fields[name]
                    if count > 128 or not target or type(target.actions) ~= 'table' or not object(setting)
                        or type(setting.enabled) ~= 'boolean' or not has(target.actions, setting.action) then valid = false; break end
                    for property in pairs(setting) do if property ~= 'enabled' and property ~= 'action' then valid = false end end
                end
            end
        elseif key == 'Detection whitelisting zones' then valid = zones(value)
        elseif key == 'Entity Firewall (BETA)' then
            valid = B.array(value, 256)
            if valid then
                for _, entry in ipairs(value) do
                    if not object(entry) or not B.text(entry.resource, 128) or not entry.resource:match('^[%w_.%-%[%]]+$')
                        or (entry.mode ~= 'observe' and entry.mode ~= 'block') then valid = false; break end
                end
            end
        else valid = B.array(value, 256) end
    end
    if not valid then return nil, 'Invalid ' .. key .. ' (' .. tostring(field.type) .. ')' end
    return true
end

function B.validateProtection(value)
    if not object(value) or not object(value.rules) then return nil, 'Complete protection policy required' end
    local result = policyDefaults()
    for _, key in ipairs(baseNames) do
        local setting = value.rules[key]
        if not object(setting) or type(setting.enabled) ~= 'boolean' or not has({ 'monitor', 'cancel', 'kick', 'ban' }, setting.action)
            or (observed[key] and setting.action ~= 'monitor') then return nil, 'Invalid protection rule: ' .. key end
        result.rules[key] = { enabled = setting.enabled, action = setting.action }
    end
    for _, key in ipairs({ 'weapons', 'entities', 'allowedWeapons', 'allowedEntities' }) do
        if not B.array(value[key], 128) then return nil, 'Invalid ' .. key end
        for _, item in ipairs(value[key]) do
            if type(item) == 'number' and finite(item) and item % 1 == 0 and item >= -2147483648 and item <= 4294967295 then
                result[key][#result[key] + 1] = item & 0xffffffff
            elseif type(item) == 'string' and #item <= 64 and item:match('^[a-zA-Z][a-zA-Z0-9_]*$') then
                result[key][#result[key] + 1] = item:lower()
            else return nil, 'Invalid native model/weapon in ' .. key end
        end
    end
    if type(value.adminBypass) ~= 'boolean' or not finite(value.movementSpeed) or value.movementSpeed < 10 or value.movementSpeed > 1000 or not zones(value.zones) then
        return nil, 'Invalid protection bypass, speed or zones'
    end
    result.adminBypass, result.movementSpeed, result.zones = value.adminBypass, value.movementSpeed, B.copy(value.zones)
    return result
end

local seed = B.bootstrap()
local state, saved, corrupt = B.loadStore('config', {})
if not saved then
    state = { revision = 1, config = B.copy(R.defaults), values = B.copy(initial), protection = policyDefaults(), remote = {} }
    if not corrupt then
        local base = R.config(seed.config)
        if base then state.config = base; state.remote.config = B.copy(base) end
        local full = seed.fullConfig
        if type(full) == 'table' and type(full.values) == 'table' then
            for key, value in pairs(full.values) do if B.validateValue(key, value, true) then state.values[key] = B.copy(value) end end
            if finite(full.revision) and full.revision % 1 == 0 and full.revision >= 0 then
                state.revision = math.max(1, full.revision); state.remote.revision = full.revision
            end
        else
            state.values['Entity ratelimit'], state.values['Explosion ratelimit'] = state.config.entityLimit, state.config.explosionLimit
        end
        local policy = B.validateProtection(seed.protection)
        if policy then state.protection = policy; state.remote.protection = B.copy(policy) end
        local ok, err = B.saveStore('config', state)
        if not ok then print('[AXIOM BACKEND] Config initialization: ' .. tostring(err)) end
    end
end
assert(type(state.values) == 'table' and R.config(state.config) and B.validateProtection(state.protection), 'AXIOM durable configuration is invalid; restore server/data/config backup')
state.remote = type(state.remote) == 'table' and state.remote or {}
for key, value in pairs(initial) do if state.values[key] == nil then state.values[key] = B.copy(value) end end
B.configState = state

local function commit(nextState)
    local ok, err = B.saveStore('config', nextState)
    if not ok then return nil, err end
    state, B.configState = nextState, nextState
    return true
end

function B.saveConfig(changes)
    if not object(changes) then return nil, 'Changes object required' end
    local nextState, count = B.copy(state), 0
    for key, value in pairs(changes) do
        count = count + 1
        if count > 256 then return nil, 'Too many changes' end
        local ok, err = B.validateValue(key, value)
        if not ok then return nil, err end
        nextState.values[key] = B.copy(value)
    end
    nextState.config.entityLimit = math.max(1, math.min(1000, math.floor(nextState.values['Entity ratelimit'])))
    nextState.config.explosionLimit = math.max(1, math.min(1000, math.floor(nextState.values['Explosion ratelimit'])))
    if B.equal(nextState, state) then return true end
    nextState.revision = state.revision + 1
    return commit(nextState)
end

function B.setMode(mode)
    if mode ~= 'monitor' and mode ~= 'protect' then return nil, 'Mode must be monitor or protect' end
    if state.config.mode == mode then return true end
    local nextState = B.copy(state)
    nextState.config.mode, nextState.revision = mode, state.revision + 1
    return commit(nextState)
end

local cachedSnapshot
function B.configSnapshot()
    if cachedSnapshot and cachedSnapshot.fullConfig.revision == state.revision then return cachedSnapshot end
    local values, clientValues = B.copy(state.values), {}
    for _, tab in ipairs(catalog.catalog.tabs) do
        if has({ 'general', 'menu-detections', 'weapons', 'misc' }, tab.id) then
            for _, field in ipairs(tab.fields) do
                if type(field.unavailable) ~= 'string' and not field.key:match('^Server weapon authorization') and not field.key:match('^Server vehicle request') then clientValues[field.key] = B.copy(values[field.key]) end
            end
        end
    end
    local full = { revision = state.revision, values = values, clientValues = clientValues,
        serverRules = B.copy(catalog.serverRules or {}), clientRules = B.copy(catalog.clientRules or {}), detectionRules = B.copy(catalog.detectionRules or {}) }
    local protection = B.copy(state.protection)
    protection.engineRules, protection.clientRules, protection.clientPolicy = B.copy(full.serverRules), B.copy(full.clientRules), {}
    for _, definition in ipairs(full.detectionRules) do
        local configured = values['Detection settings'][definition.key]
        local rule = { enabled = values[definition.key] ~= false and (not configured or configured.enabled ~= false),
            action = configured and has(definition.actions, configured.action) and configured.action or definition.defaultAction }
        protection.rules[definition.key] = rule
        if has(full.clientRules, definition.key) then protection.clientPolicy[definition.key] = B.copy(rule) end
    end
    cachedSnapshot = { config = B.copy(state.config), fullConfig = full, protection = protection }
    return cachedSnapshot
end

-- Remote markers describe the last accepted dashboard state, not local CLI state.
-- A repeated revision/base/policy therefore cannot roll back a local console change.
function B.acceptConfig(response)
    if type(response) ~= 'table' then return nil, 'Dashboard object required' end
    local nextState = B.copy(state)
    if response.config ~= nil then
        local base = R.config(response.config)
        if not base then return nil, 'Invalid dashboard base configuration' end
        if not B.equal(base, state.remote.config) then
            for key, value in pairs(base) do
                if not state.remote.config or not B.equal(value, state.remote.config[key]) then nextState.config[key] = value end
            end
            nextState.remote.config = B.copy(base)
        end
    end
    if response.protection ~= nil then
        local policy, err = B.validateProtection(response.protection)
        if not policy then return nil, err end
        if not B.equal(policy, state.remote.protection) then nextState.protection, nextState.remote.protection = policy, B.copy(policy) end
    end
    local full = response.fullConfig
    if full ~= nil then
        if type(full) ~= 'table' or not finite(full.revision) or full.revision % 1 ~= 0 or full.revision < 0 or not object(full.values) then return nil, 'Invalid dashboard full configuration' end
        if state.remote.revision == nil or full.revision > state.remote.revision then
            for key, value in pairs(full.values) do
                local ok, err = B.validateValue(key, value, true)
                if not ok then return nil, err end
                nextState.values[key] = B.copy(value)
            end
            nextState.remote.revision = full.revision
        end
    end
    if B.equal(nextState, state) then return true end
    nextState.revision = state.revision + 1
    return commit(nextState)
end
