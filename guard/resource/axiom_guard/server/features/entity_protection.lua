local S = AxiomServerFeatures
local on, contains, deleteObserved, provenance = S.on, S.contains, S.deleteObserved, S.provenance

function S.entityProtection(id, resource, record, entity)
    if on('Entity Protection') and not resource and not contains('Entity Protection whitelist', record.model) then
        if deleteObserved(id, 'Entity Protection', entity, { model = record.model,
            scope = 'client-origin mission entity with empty script provenance; not proof of malicious creation' }) then
            return DoesEntityExist(entity)
        end
    end
end
