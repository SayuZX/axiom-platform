local S = AxiomServerFeatures
local on, deleteObserved = S.on, S.deleteObserved

function S.entityAttach(id, record, entity, target)
    if on('Anti entity attach') and target == GetPlayerPed(id) then
        if deleteObserved(id, 'Anti entity attach', entity, { model = record.model,
            scope = 'client-origin mission attachment to creator ped' }) then return DoesEntityExist(entity) end
    end
end
