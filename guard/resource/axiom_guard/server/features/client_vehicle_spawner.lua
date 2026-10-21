local S = AxiomServerFeatures
local on, native, cancel = S.on, S.native, S.cancel

function S.clientVehicleSpawn(id, model, kind, entity, resource)
    if on('Anti client vehicle spawner') and kind == 2
        and native('NetworkGetFirstEntityOwner', 'Anti client vehicle spawner', entity) == id then
        cancel(id, 'Anti client vehicle spawner', { model = model, resource = resource or 'unknown',
            scope = 'client-origin mission vehicle; allow legitimate creators in Resource entity whitelist' })
    end
end
