local S = AxiomServerFeatures
local set, state, active, invokingResource = S.set, S.state, S.active, S.invokingResource

local eventHandlers = {}
local reservedEvents = {}
for name in ('entityCreating entityCreated entityRemoved explosionEvent ptFxEvent startProjectileEvent weaponDamageEvent giveWeaponEvent removeWeaponEvent removeAllWeaponsEvent playerConnecting playerJoining playerDropped onResourceStart onResourceStop onResourceStarting onServerResourceStart onServerResourceStop playerEnteredScope playerLeftScope rconCommand resourceStarting'):gmatch('%S+') do
    reservedEvents[name] = true
end
local function validEvent(name)
    return type(name) == 'string' and #name > 0 and #name <= 160 and not name:find('[%c*]')
        and not reservedEvents[name] and not name:find('^__cfx') and not name:find('^axiom_guard:')
end

function S.guardEvent(id, name, resource, ...)
    local s, player = active(id)
    if not s then return true end
    local logHere = not resource or not eventHandlers[name]
    if logHere then
        S.logEvent(player, name, resource, ...)
        S.eventProtectionLog(player, name, resource)
        S.eventStatsRecord(s)
    end
    if not S.eventAI(player, s, name) then return false end
    return S.eventProtection(player, name, resource)
end
-- Integration: if not exports.axiom_guard:GuardEvent(source, 'resource:event') then return end
-- CancelEvent alone cannot prevent other resources' registered Lua handlers running.
function S.guardEventExport(id, name, ...)
    local resource, err = invokingResource()
    if not resource then return false, err end
    if not validEvent(name) or not state(id) then return false, 'valid network event and connected player required' end
    return S.guardEvent(id, name, resource, ...)
end

exports('GuardEvent', S.guardEventExport)

function S.syncEventHandlers()
    local desired = {}
    for _, label in ipairs({ 'EP: Blacklisted events', 'EP: Whitelisted events', 'Event AI whitelist' }) do
        for name in pairs(set(label)) do if validEvent(name) then desired[name] = true end end
    end
    for name, handler in pairs(eventHandlers) do
        if not desired[name] then RemoveEventHandler(handler); eventHandlers[name] = nil end
    end
    for name in pairs(desired) do
        if not eventHandlers[name] then
            -- Lua safeForNet is resource-local; only this metadata-only handler is exposed.
            RegisterNetEvent(name)
            eventHandlers[name] = AddEventHandler(name, function(...)
                local id = tonumber(source)
                if id and id > 0 then S.guardEvent(id, name, nil, ...) end
            end)
        end
    end
end
