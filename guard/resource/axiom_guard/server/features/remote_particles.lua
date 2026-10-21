local S = AxiomServerFeatures
local finite, on, cancel, coords, distance, netEntity = S.finite, S.on, S.cancel, S.coords, S.distance, S.netEntity

function S.remoteParticles(id, data)
    if not on('Block remote particles') then return end
    if data.isOnEntity == true then
        local target = netEntity(data.entityNetId)
        if not target then return end
        local owner = NetworkGetEntityOwner(target)
        if owner and owner > 0 and owner ~= id then
            cancel(id, 'Block remote particles', { effect = data.effectHash, target = data.entityNetId, owner = owner })
        end
    elseif finite(data.posX) and finite(data.posY) and finite(data.posZ) then
        local a = coords(GetPlayerPed(id))
        local b = { x = data.posX, y = data.posY, z = data.posZ }
        if a and distance(a, b) > 100 then
            cancel(id, 'Block remote particles', { effect = data.effectHash, distance = distance(a, b), limit = 100 })
        end
    end
end
