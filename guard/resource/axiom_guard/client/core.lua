-- Client observations are forgeable; only the reporting session is authenticated.
-- Legitimate scripts can match these heuristics. Disruptive actions require opt-in.
AxiomClient = {
    config = {}, revision = -1, received = false, policy = nil, policyAt = nil,
    list = {}, hashes = {}, streak = {}, shotCounts = {}, motion = {}, shots = {},
    features = {}, tasks = {}, resetters = {}, input = {}, inventory = {}
}
local C = AxiomClient
local phases = { 'check', 'inventory', 'weapon', 'sample', 'shot', 'damage', 'command', 'menu' }
for _, phase in ipairs(phases) do C.tasks[phase] = {} end
local sent, missing, window, events = {}, {}, 0, 0

function C.finite(value)
    return type(value) == 'number' and value == value and math.abs(value) < 1e12
end
function C.policyFresh()
    if not C.policy or not C.policyAt or C.policy.exempt then return false end
    return ((GetGameTimer() - C.policyAt) & 0xffffffff) < C.policy.ttlMs
end
function C.active(rule)
    if not C.policyFresh() then return false end
    local policy = C.policy.rules[rule]
    if type(policy) ~= 'table' or policy.enabled ~= true then return false end
    local value = C.config[rule]
    return value == true or (C.finite(value) and value >= 0)
        or (type(value) == 'table' and #value > 0)
end
function C.number(rule, fallback)
    return C.finite(C.config[rule]) and C.config[rule] or fallback
end
function C.weaponHash(value)
    if type(value) == 'string' then value = tonumber(value) or GetHashKey(value) end
    if not C.finite(value) or value % 1 ~= 0 then return nil end
    return value & 0xffffffff
end
function C.whitelisted(rule, weapon)
    local set = C.hashes[rule]
    if not set then return false end
    return set[C.weaponHash(weapon)] or set[C.weaponHash(GetWeapontypeGroup(weapon))] or false
end
function C.distance(a, b) return #(a - b) end
function C.direction(rotation)
    local yaw, pitch = math.rad(rotation.z), math.rad(rotation.x)
    return vector3(-math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch))
end
function C.angle(a, b)
    local length = #a * #b
    if length < 0.001 then return 180 end
    return math.deg(math.acos(math.max(-1, math.min(1, (a.x*b.x + a.y*b.y + a.z*b.z) / length))))
end
function C.ready(ped)
    return DoesEntityExist(ped) and not IsEntityDead(ped)
        and IsPlayerControlOn(PlayerId()) and IsScreenFadedIn()
        and not IsPauseMenuActive() and not IsPlayerSwitchInProgress() and not IsCutsceneActive()
end
function C.register(rule, feature)
    C.features[rule] = feature
    for _, phase in ipairs(phases) do
        if feature[phase] then
            local tasks = C.tasks[phase]
            tasks[#tasks + 1] = feature[phase]
        end
    end
end
function C.run(phase, sample)
    local tasks = C.tasks[phase]
    for i = 1, #tasks do tasks[i](sample) end
end
function C.onReset(callback) C.resetters[#C.resetters + 1] = callback end
function C.resetShots()
    C.shots, C.shotCounts = {}, {}
    for _, feature in pairs(C.features) do
        if feature.resetShot then feature.resetShot() end
    end
end
function C.reset()
    C.streak, C.motion = {}, {}
    C.resetShots()
    for i = 1, #C.resetters do C.resetters[i]() end
    for _, feature in pairs(C.features) do
        if feature.reset then feature.reset() end
    end
end
function C.signal(rule, evidence)
    if not C.active(rule) then return end
    local now = GetGameTimer()
    local feature = C.features[rule]
    -- Capture before restoration; cooldowns limit reports, not restoration.
    if feature and feature.mitigate and evidence.kind ~= 'native_unavailable'
        and evidence.diagnostic ~= true and C.policy.mode == 'protect'
        and C.policy.rules[rule].action == 'cancel' then
        local ped, player = PlayerPedId(), PlayerId()
        if C.ready(ped) then feature.mitigate(ped, player, evidence) end
    end
    if now - window >= 5000 or now < window then window, events = now, 0 end
    if events >= 6 or (sent[rule] and now >= sent[rule] and now - sent[rule] < 60000) then return end
    local bounded = { revision = C.revision, observation = true, diagnostic = evidence.diagnostic,
        mitigationRequested = evidence.mitigationRequested, mitigationApplied = evidence.mitigationApplied }
    local count = 0
    for key, value in pairs(evidence) do
        if count >= 8 then break end
        if type(key) == 'string' and #key <= 40 and key ~= 'mitigationRequested'
            and key ~= 'mitigationApplied' and key ~= 'diagnostic' then
            if type(value) == 'string' then value = value:sub(1, 128) end
            if type(value) == 'string' or type(value) == 'boolean' or C.finite(value) then
                bounded[key], count = value, count + 1
            end
        end
    end
    sent[rule], events = now, events + 1
    TriggerServerEvent('axiom_guard:signal', rule, bounded)
end
function C.native(rule, name, ...)
    if missing[name] then return nil end
    local fn = _G[name]
    if type(fn) == 'function' then
        local ok, a, b = pcall(fn, ...)
        if ok then return a, b, true end
    end
    missing[name] = true
    print(('[axiom_guard] %s unavailable: %s'):format(rule, name))
    C.signal(rule, { kind = 'native_unavailable', native = name })
end
function C.restoreNative(rule, evidence, name, ...)
    local a, b, ok = C.native(rule, name, ...)
    if not ok then evidence.diagnostic = true end
    if ok then evidence.mitigationRequested = true end
    return a, b, ok
end
function C.observe(rule, condition, evidence, delay)
    if not C.active(rule) or not condition then C.streak[rule] = nil return end
    local now = GetGameTimer()
    C.streak[rule] = C.streak[rule] or now
    if now - C.streak[rule] >= (delay or 1500) then C.signal(rule, evidence) end
end
function C.accumulate(rule, condition, evidence, required, now)
    if not C.active(rule) or not condition then C.shotCounts[rule] = nil return end
    local count = C.shotCounts[rule]
    if not count or now - count.start > 12000 then count = { start = now, count = 0 } end
    count.count = count.count + 1
    C.shotCounts[rule] = count
    if count.count >= required then
        evidence.samples, evidence.windowMs = count.count, now - count.start
        C.signal(rule, evidence)
    end
end
-- Restore only the local ped to a recent, grounded, same-model/interior position.
function C.restorePosition(rule, ped, evidence)
    local safe, now = C.motion.safe, GetGameTimer()
    if not safe or safe.ped ~= ped or safe.model ~= GetEntityModel(ped)
        or safe.interior ~= GetInteriorFromEntity(ped) or now < safe.time or now - safe.time > 10000
        or IsPedInAnyVehicle(ped, false) or IsEntityAttached(ped)
        or C.distance(GetEntityCoords(ped), safe.position) > 250 then return end
    local p = safe.position
    local found, ground = C.native(rule, 'GetGroundZFor_3dCoord', p.x, p.y, p.z + 1.0, false)
    if found ~= true or not C.finite(ground) or math.abs(p.z - ground) > 1.5 then return end
    C.native(rule, 'SetEntityCollision', ped, true, true)
    C.native(rule, 'SetEntityVelocity', ped, 0.0, 0.0, 0.0)
    local _, _, ok = C.native(rule, 'SetEntityCoordsNoOffset', ped, p.x, p.y, p.z, false, false, true)
    if ok then
        evidence.mitigationRequested = true
        C.motion.restored = GetEntityCoords(ped)
        evidence.mitigationApplied = C.distance(C.motion.restored, p) < 0.5
    end
end
C.unarmed = C.weaponHash('WEAPON_UNARMED')
