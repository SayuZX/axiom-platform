local S = AxiomServerFeatures
local on, native, hash, contains, cancel, deleteObserved = S.on, S.native, S.hash, S.contains, S.cancel, S.deleteObserved

function S.armedPedSpawn(id, model, kind, entity)
    if on('Anti armed peds') and kind == 1 and not contains('Armed ped whitelist', model) then
        local weapon = native('GetSelectedPedWeapon', 'Anti armed peds', entity)
        if weapon and weapon ~= 0 and hash(weapon) ~= hash('WEAPON_UNARMED')
            and not contains('Armed ped whitelist', weapon) then
            cancel(id, 'Anti armed peds', { model = model, weapon = weapon, scope = 'script-created NPC' })
        end
    end
end

function S.armedPedSample(id, record, kind, entity)
    if on('Anti armed peds') and kind == 1 and not contains('Armed ped whitelist', record.model) then
        local weapon = native('GetSelectedPedWeapon', 'Anti armed peds', entity)
        if weapon and weapon ~= 0 and hash(weapon) ~= hash('WEAPON_UNARMED')
            and not contains('Armed ped whitelist', weapon) then
            if deleteObserved(id, 'Anti armed peds', entity, { model = record.model, weapon = weapon,
                scope = 'client-origin mission NPC; deleted rather than relying on client disarm RPC' }) then
                return DoesEntityExist(entity)
            end
        end
    end
end
