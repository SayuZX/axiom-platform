local S, F = AxiomServerFeatures, AxiomFullServer
local vehicleLabel = 'Server vehicle request guard'

local function explicitBlockLabel(model)
    local values, old = S.config(), F.getProtection()
    if values['Entity list type'] ~= 'Whitelist' and S.contains('Entity list (blacklist/whitelist)', model) then
        return 'Entity list (blacklist/whitelist)'
    end
    if S.legacyBlocked(model, old.entities, old.allowedEntities) then return 'entity_blacklist' end
end

-- Population 0 can be client-created without the mission flag. Ambient populations 1..6
-- never enter this gate; mission entities retain the existing full list/rate pipeline.
function S.entityGate(entity, id)
    if not S.active(id) then return false end
    local population = S.native('GetEntityPopulationType', 'Entity list (blacklist/whitelist)', entity)
    if population ~= 0 then return false end
    if S.native('NetworkGetFirstEntityOwner', 'Entity list (blacklist/whitelist)', entity) ~= id then return false end
    local kind = GetEntityType(entity)
    if kind ~= 1 and kind ~= 2 and kind ~= 3 then return false end
    if kind == 1 and S.native('IsPedAPlayer', 'Entity list (blacklist/whitelist)', entity) ~= false then return false end
    if S.trustedEntity(entity) then return false end
    local model = GetEntityModel(entity)
    local label = model and model ~= 0 and explicitBlockLabel(model)
    if label then
        return S.cancel(id, label, { model = model, entityType = kind, population = population,
            attribution = 'first and current client network owner; explicit blacklist only' })
    end
    return false
end

local function vehicleRejected(id, reason, evidence, malformed)
    evidence.reason, evidence.eventCancelled = reason, false
    local action = F.action(id, vehicleLabel)
    local rejected = malformed or S.blocking(action)
    evidence.operationRejected = rejected
    F.enforce(id, vehicleLabel, evidence)
    return not rejected
end

-- Runs before a framework callback creates a server-owned vehicle on behalf of a client.
-- Unlike entityCreating, this retains the requesting player even when network owner is 0.
function S.validateVehicleRequest(id, model, coords)
    if not S.on(vehicleLabel) then return true end
    local s, player = S.state(id)
    if not s then return false end
    local hash = S.hash(model)
    local evidence = { model = hash, authority = 'QBCore server vehicle callback requester' }
    if not hash or hash == 0 or type(model) == 'string' and #model > 64 then
        return vehicleRejected(player, 'invalid vehicle model', evidence, true)
    end
    local ped = GetPlayerPed(player)
    local origin = S.coords(ped)
    if not origin then return vehicleRejected(player, 'server player position unavailable', evidence, true) end
    if coords ~= nil then
        local kind = type(coords)
        if kind ~= 'table' and kind ~= 'vector3' and kind ~= 'vector4' then
            return vehicleRejected(player, 'invalid vehicle coordinates', evidence, true)
        end
        if not S.finite(coords.x) or not S.finite(coords.y) or not S.finite(coords.z)
            or kind ~= 'vector3' and coords.w ~= nil and not S.finite(coords.w) then
            return vehicleRejected(player, 'invalid vehicle coordinates', evidence, true)
        end
    else
        coords = origin
    end
    if F.allowed(player) then return true end
    local old = F.getProtection()
    if S.listed(hash, 'Entity list (blacklist/whitelist)', 'Entity list type')
        or S.legacyBlocked(hash, old.entities, old.allowedEntities) then
        if not vehicleRejected(player, 'vehicle model denied by entity policy', evidence) then return false end
    end
    local range = S.distance(origin, coords)
    local maxDistance = S.number('Server vehicle request distance', 100)
    if range > maxDistance then
        evidence.distance, evidence.maxDistance = range, maxDistance
        if not vehicleRejected(player, 'vehicle request outside server position tolerance', evidence) then return false end
    end
    local now, window = GetGameTimer(), s.vehicleRequests
    local seconds = S.number('Server vehicle request window', 15)
    if not window or S.elapsed(now, window.at) >= seconds * 1000 then
        window = { at = now, count = 0 }; s.vehicleRequests = window
    end
    window.count = math.min(window.count + 1, 1000000)
    local limit = S.number('Server vehicle request limit', 5)
    if window.count > limit then
        evidence.count, evidence.limit, evidence.windowSeconds = window.count, limit, seconds
        return vehicleRejected(player, 'vehicle request rate exceeded', evidence)
    end
    return true
end
