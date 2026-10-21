-- Independent, server-observed controls; no private Fini models or wildcard event hook.
-- Native reference: https://runtime.fivem.net/doc/natives_cfx.json
local F = AxiomFullServer
local players, tracked, overrides, notices = {}, {}, {}, {}
local values, sets = nil, {}
local function config()
    local current = F.getConfig() or values or {}
    if current ~= values then values, sets = current, {} end
    return values or {}
end
local function finite(n) return type(n) == 'number' and n == n and math.abs(n) < math.huge end
local function elapsed(now, before) return (now - before) & 0xffffffff end
local function number(label, fallback)
    local n = config()[label]
    return finite(n) and n or fallback
end
local function on(label) return config()[label] == true end
local function diagnostic(label, reason)
    local key = label .. ':' .. reason
    if not notices[key] then
        notices[key] = true
        print(('[axiom_guard] %s: %s'):format(label, reason))
    end
end
local function native(name, label, ...)
    local fn = _G[name]
    if type(fn) ~= 'function' then diagnostic(label, 'unavailable native ' .. name); return nil end
    local ok, result = pcall(fn, ...)
    if ok then return result, true end
    diagnostic(label, 'native call failed: ' .. name)
end
local function hash(value)
    local n = tonumber(value)
    if not n and type(value) == 'string' then n = GetHashKey(value) end
    return finite(n) and n % 1 == 0 and (n & 0xffffffff) or nil
end
local function set(label, convert)
    config()
    local key = label .. (convert and ':hash' or ':text')
    if not sets[key] then
        local result = {}
        for _, item in ipairs(type(values[label]) == 'table' and values[label] or {}) do
            local value = convert and convert(item) or item
            if value ~= nil and (type(value) == 'number' or type(value) == 'string') then result[value] = true end
        end
        sets[key] = result
    end
    return sets[key]
end
local function contains(label, value) return set(label, hash)[hash(value)] == true end
local function state(id)
    id = tonumber(id)
    if not finite(id) or id < 1 or id % 1 ~= 0 or not GetPlayerName(id) then return nil end
    if not players[id] then players[id] = { joined = GetGameTimer(), windows = {} } end
    return players[id], id
end
local function active(id)
    local s, player = state(id)
    return s and not F.allowed(player) and s or nil, player
end
local function report(id, label, evidence) return F.report(id, label, evidence, 'server') end
local function cancel(id, label, evidence) return F.cancel(id, label, evidence) end
local function blocking(action) return action == 'cancel' or action == 'kick' or action == 'ban' end
-- Sampled remedies are not cancellable engine events. Record requests, never claimed success.
local function deleteObserved(id, label, entity, evidence)
    local action = F.action(id, label)
    if action == 'none' then return false end
    evidence.eventCancelled = false
    if blocking(action) then
        local _, ok = native('DeleteEntity', label, entity)
        if not ok then return false end
        evidence.remedyRequested = true
        evidence.remedy = 'delete_entity'
    end
    F.enforce(id, label, evidence)
    return blocking(action)
end
local function rate(id, label, limit, seconds)
    if not finite(limit) or limit <= 0 then return end
    local s = state(id)
    if not s then return end
    local now, window = GetGameTimer(), s.windows[label]
    seconds = math.max(0.1, seconds or 10)
    if not window or elapsed(now, window.at) >= seconds * 1000 then
        window = { at = now, count = 0 }; s.windows[label] = window
    end
    window.count = math.min(window.count + 1, 1000000)
    if window.count > limit then
        cancel(id, label, { count = window.count, limit = limit, windowSeconds = seconds })
    end
end
local function coords(entity)
    if not entity or entity == 0 or not DoesEntityExist(entity) then return end
    local p = GetEntityCoords(entity)
    if p and finite(p.x) and finite(p.y) and finite(p.z) then return p end
end
local function distance(a, b)
    return math.sqrt((a.x-b.x)^2 + (a.y-b.y)^2 + (a.z-b.z)^2)
end
local function listed(model, list, mode)
    local found = contains(list, model)
    return config()[mode] == 'Whitelist' and not found or config()[mode] ~= 'Whitelist' and found
end
local function legacyBlocked(value, blocked, allowed)
    local h = hash(value)
    for _, v in ipairs(allowed or {}) do if hash(v) == h then return false end end
    for _, v in ipairs(blocked or {}) do if hash(v) == h then return true end end
    return false
end
local function provenance(entity)
    local resource, ok = native('GetEntityScript', 'Resource entity whitelist', entity)
    if not ok or type(resource) ~= 'string' then return nil, false end
    return resource ~= '' and resource or nil, true
end
local function trustedEntity(entity)
    local resource, known = provenance(entity)
    return resource and set('Resource entity whitelist')[resource] == true, resource, known
end
local function firewall(resource)
    local rules = config()['Entity Firewall (BETA)']
    for _, rule in ipairs(type(rules) == 'table' and rules or {}) do
        if type(rule) == 'table' and rule.resource == resource then return rule.mode end
    end
end
local function playerWhitelist(id, label)
    local allowed = set(label)
    for _, identifier in ipairs(GetPlayerIdentifiers(id)) do
        if allowed[identifier] then return true end
    end
    return false
end
local function scripted(entity)
    return native('GetEntityPopulationType', 'Entity ratelimit', entity) == 7
end
local function netEntity(netId)
    if not finite(netId) or netId <= 0 or netId % 1 ~= 0 then return end
    local entity = NetworkGetEntityFromNetworkId(netId)
    if entity and entity ~= 0 and DoesEntityExist(entity) then return entity end
end
local function sameBucket(id, entity)
    local playerBucket = native('GetPlayerRoutingBucket', 'Max player kill distance', id)
    local targetBucket = native('GetEntityRoutingBucket', 'Max player kill distance', entity)
    return playerBucket ~= nil and playerBucket == targetBucket
end
local function invokingResource()
    local resource = GetInvokingResource()
    if type(resource) ~= 'string' or resource == '' or GetResourceState(resource) ~= 'started' then
        return nil, 'server resource invocation required'
    end
    return resource
end
local function validKey(value)
    return type(value) == 'string' and #value > 0 and #value <= 128 and not value:find('%c')
end

AxiomServerFeatures = { players = players, tracked = tracked, overrides = overrides, trackedCount = 0 }
local S = AxiomServerFeatures
S.config = config
S.finite = finite
S.elapsed = elapsed
S.number = number
S.on = on
S.diagnostic = diagnostic
S.native = native
S.hash = hash
S.set = set
S.contains = contains
S.state = state
S.active = active
S.report = report
S.cancel = cancel
S.blocking = blocking
S.deleteObserved = deleteObserved
S.rate = rate
S.coords = coords
S.distance = distance
S.listed = listed
S.legacyBlocked = legacyBlocked
S.provenance = provenance
S.trustedEntity = trustedEntity
S.firewall = firewall
S.playerWhitelist = playerWhitelist
S.scripted = scripted
S.netEntity = netEntity
S.sameBucket = sameBucket
S.invokingResource = invokingResource
S.validKey = validKey

-- GTA explosion tags, not joaat hashes: https://docs.fivem.net/natives/?_0xE3AD2BDBAEE269AC
local explosionTags = {}
local explosionNames = 'GRENADE GRENADELAUNCHER STICKYBOMB MOLOTOV ROCKET TANKSHELL HI_OCTANE CAR PLANE PETROL_PUMP BIKE DIR_STEAM DIR_FLAME DIR_WATER_HYDRANT DIR_GAS_CANISTER BOAT SHIP_DESTROY TRUCK BULLET SMOKE_GRENADE_LAUNCHER SMOKE_GRENADE BZGAS FLARE GAS_CANISTER EXTINGUISHER PROGRAMMABLEAR TRAIN BARREL PROPANE BLIMP DIR_FLAME_EXPLODE TANKER PLANE_ROCKET VEHICLE_BULLET GAS_TANK BIRD_CRAP RAILGUN BLIMP2 FIREWORK SNOWBALL PROXMINE VALKYRIE_CANNON AIR_DEFENCE PIPEBOMB VEHICLEMINE EXPLOSIVEAMMO APCSHELL BOMB_CLUSTER BOMB_GAS BOMB_INCENDIARY BOMB_STANDARD TORPEDO TORPEDO_UNDERWATER BOMBUSHKA_CANNON BOMB_CLUSTER_SECONDARY HUNTER_BARRAGE HUNTER_CANNON ROGUE_CANNON MINE_UNDERWATER ORBITAL_CANNON BOMB_STANDARD_WIDE EXPLOSIVEAMMO_SHOTGUN OPPRESSOR2_CANNON MORTAR_KINETIC VEHICLEMINE_KINETIC VEHICLEMINE_EMP VEHICLEMINE_SPIKE VEHICLEMINE_SLICK VEHICLEMINE_TAR SCRIPT_DRONE RAYGUN BURIEDMINE SCRIPT_MISSILE RCTANK_ROCKET BOMB_WATER BOMB_WATER_SECONDARY MINE_CNCSPIKE BZGAS_MK2 FLASHGRENADE STUNGRENADE CNC_KINETICRAM SCRIPT_MISSILE_LARGE SUBMARINE_BIG EMPLAUNCHER_EMP'
local explosionIndex = 0
for name in explosionNames:gmatch('%S+') do
    explosionTags['EXP_TAG_' .. name] = explosionIndex
    explosionIndex = explosionIndex + 1
end
local function explosion(value)
    return tonumber(value) or type(value) == 'string' and explosionTags[value:upper()] or nil
end
S.explosion = explosion

local function remoteWeaponEvent(sender, data, label)
    local s, id = active(sender)
    if not s or not on(label) or type(data) ~= 'table' then return end
    local target = netEntity(data.pedId)
    if not target or GetEntityType(target) ~= 1 then return end
    local owner = NetworkGetEntityOwner(target)
    if owner and owner > 0 and owner ~= id then
        cancel(id, label, { target = data.pedId, targetOwner = owner, weapon = data.weaponType,
            scope = 'cross-owner weapon operation; local inventory operations are excluded' })
    end
end
S.remoteWeaponEvent = remoteWeaponEvent
