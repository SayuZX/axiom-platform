local S = AxiomServerFeatures
local on, deleteObserved = S.on, S.deleteObserved

function S.remoteEntityAttach(id, record, entity, owner)
    if on('Anti remote entity attach') and owner and owner > 0 and owner ~= id then
        if deleteObserved(id, 'Anti remote entity attach', entity, { model = record.model, targetOwner = owner,
            attribution = 'attachment first/current owner; target owner is not accused' }) then return DoesEntityExist(entity) end
    end
end
