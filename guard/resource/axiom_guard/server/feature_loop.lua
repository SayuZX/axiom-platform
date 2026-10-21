local S = AxiomServerFeatures
local active, state, config, native = S.active, S.state, S.config, S.native
local scripted, trustedEntity, diagnostic = S.scripted, S.trustedEntity, S.diagnostic

function S.inspectSpawn(entity)
    local owner = NetworkGetEntityOwner(entity)
    local s, id = active(owner)
    if not s then return end
    if S.entityGate(entity, id) then return end
    if not scripted(entity) then return end
    if GetEntityType(entity) == 1 and native('IsPedAPlayer', 'Entity list (blacklist/whitelist)', entity) ~= false then return end
    local exempt, resource, known = trustedEntity(entity)
    if exempt then return end
    local model, kind = GetEntityModel(entity), GetEntityType(entity)
    if not model or model == 0 then return end
    local evidence = { model = model, entityType = kind, resource = resource or 'unknown' }
    S.clientVehicleSpawn(id, model, kind, entity, resource)
    S.armedPedSpawn(id, model, kind, entity)
    if known then S.entityFirewallSpawn(id, resource, evidence) end
    S.entityList(id, model, evidence)
    S.entityPlaytime(id, s, model, evidence)
    S.entityRate(id, model)
    S.entityDistance(id, model, entity)
end

function S.entityRemoved(entity)
    if S.tracked[entity] then S.tracked[entity] = nil; S.trackedCount = S.trackedCount - 1 end
end

function S.entityCreated(entity)
    local owner = native('NetworkGetFirstEntityOwner', 'Entity Protection', entity)
    if not state(owner) or NetworkGetEntityOwner(entity) ~= owner or not scripted(entity) then return end
    if S.trackedCount >= 4096 then diagnostic('Entity Protection', 'tracking cap 4096 reached'); return end
    if not S.tracked[entity] then S.trackedCount = S.trackedCount + 1 end
    S.tracked[entity] = { owner = owner, model = GetEntityModel(entity), at = GetGameTimer() }
end

function S.explosionEvent(sender, data)
    local s, id = active(sender)
    if not s or type(data) ~= 'table' or not S.finite(data.explosionType) then return end
    local kind = data.explosionType
    S.explosionList(id, data, kind)
    S.explosionModifiers(id, data, kind)
    S.explosionRate(id, kind)
end

function S.projectileEvent(sender, data)
    local s, id = active(sender)
    if not s then return end
    S.projectileRate(id)
    if type(data) == 'table' and not S.weaponAuthorization(id, data.weaponHash, 'startProjectileEvent') then return end
    if type(data) == 'table' and S.finite(data.weaponHash) then S.weaponBlocked(id, data.weaponHash) end
end

function S.damageEvent(sender, data)
    local s, id = active(sender)
    if not s or type(data) ~= 'table' then return end
    local weapon = data.weaponType
    if not S.weaponAuthorization(id, weapon, 'weaponDamageEvent') then return end
    if S.finite(weapon) then S.weaponBlocked(id, weapon) end
    S.weaponDamage(id, data, weapon)
    S.badDamage(id, data, weapon)
    S.damageTracking(id, data, weapon)
    local target = S.netEntity(data.hitGlobalId)
    if not target or not S.sameBucket(id, target) then return end
    local a, b = S.coords(GetPlayerPed(id)), S.coords(target)
    if not a or not b then return end
    local range = S.distance(a, b)
    -- Replication lag allowance; no cancellation from client-reported positions.
    local tolerance = 5 + math.min(GetPlayerPing(id), 500) * 0.04
    S.taze(id, weapon, range, tolerance)
    S.killDistance(id, data, weapon, target, range, tolerance)
end

function S.particleEvent(sender, data)
    local s, id = active(sender)
    if not s then return end
    S.particleRate(id)
    if type(data) ~= 'table' or S.contains('Allowed particles', data.effectHash) then return end
    S.particleScale(id, data)
    S.remoteParticles(id, data)
end

function S.observeEntity(entity, record)
    if not DoesEntityExist(entity) or GetEntityModel(entity) ~= record.model then return false end
    local s, id = active(record.owner)
    if not s or NetworkGetEntityOwner(entity) ~= id or not scripted(entity) then return true end
    if native('NetworkGetFirstEntityOwner', 'Entity Protection', entity) ~= id then return false end
    local exempt, resource, known = trustedEntity(entity)
    if exempt then return true end
    local kind = GetEntityType(entity)
    if kind == 1 and native('IsPedAPlayer', 'Anti entity attach', entity) ~= false then return true end
    local evidence = { model = record.model, resource = resource or 'unknown',
        attribution = 'first and current network owner; resource initiating operation not proven' }
    local result = known and S.entityFirewallSample(id, resource, entity, evidence) or nil
    if result ~= nil then return result end
    result = S.armedPedSample(id, record, kind, entity)
    if result ~= nil then return result end
    result = S.entityProtection(id, resource, record, entity)
    if result ~= nil then return result end
    if (S.on('Anti entity attach') or S.on('Anti remote entity attach'))
        and not S.contains('Anti entity attach whitelist', record.model) then
        local target = native('GetEntityAttachedTo', 'Anti entity attach', entity)
        if target and target ~= 0 and DoesEntityExist(target) then
            local owner = NetworkGetEntityOwner(target)
            if S.on('Anti remote entity attach') and owner and owner > 0 and owner ~= id then
                result = S.remoteEntityAttach(id, record, entity, owner)
            else
                result = S.entityAttach(id, record, entity, target)
            end
            if result ~= nil then return result end
        end
    end
    return true
end

function S.sampleEntities()
    local processed = 0
    for entity, record in pairs(S.tracked) do
        if not S.observeEntity(entity, record) then S.entityRemoved(entity) end
        processed = processed + 1
        if processed % 64 == 0 then Wait(0) end
    end
end

AddEventHandler('entityCreating', S.inspectSpawn)
AddEventHandler('entityCreating', S.weaponSpawn)
AddEventHandler('entityRemoved', S.entityRemoved)
AddEventHandler('entityCreated', S.entityCreated)
AddEventHandler('explosionEvent', S.explosionEvent)
AddEventHandler('startProjectileEvent', S.projectileEvent)
AddEventHandler('weaponDamageEvent', S.damageEvent)
AddEventHandler('giveWeaponEvent', S.giveWeapon)
AddEventHandler('removeWeaponEvent', S.removeWeapon)
AddEventHandler('removeAllWeaponsEvent', S.removeWeapon)
AddEventHandler('ptFxEvent', S.particleEvent)
AddEventHandler('playerJoining', S.playerJoining)
AddEventHandler('playerDropped', S.playerDropped)
AddEventHandler('onResourceStop', S.resourceStopped)

for _, name in ipairs({ 'explosionEvent', 'ptFxEvent', 'startProjectileEvent', 'weaponDamageEvent',
    'giveWeaponEvent', 'removeWeaponEvent', 'removeAllWeaponsEvent' }) do
    AddEventHandler(name, function(sender, data) S.logEvent(sender, name, nil, data) end)
end
AddEventHandler('entityCreating', function(entity)
    S.logEvent(NetworkGetEntityOwner(entity), 'entityCreating', S.provenance(entity), GetEntityModel(entity), GetEntityType(entity))
end)

CreateThread(function()
    local tick, lastConfig = 0, nil
    for _, id in ipairs(GetPlayers()) do state(id) end
    while true do
        local current = config()
        if current ~= lastConfig then
            S.syncEventHandlers()
            S.syncStatebagHandler()
            lastConfig = current
        end
        if tick % 2 == 0 then S.sampleEntities() end
        if tick % 5 == 0 then
            for _, raw in ipairs(GetPlayers()) do
                local s, id = active(raw)
                if s then S.samplePed(id, s) end
            end
        end
        if tick % 60 == 0 then S.eventStatsFlush() end
        tick = (tick + 1) % 60
        Wait(1000)
    end
end)
CreateThread(function()
    while true do
        Wait(math.max(100, math.min(2000, S.number('Super jump detection time (in ms)', 400))))
        for _, raw in ipairs(GetPlayers()) do
            local s, id = active(raw)
            if s then S.sampleJump(id, s) end
        end
    end
end)
