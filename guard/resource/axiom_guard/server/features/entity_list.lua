local S = AxiomServerFeatures
local F = AxiomFullServer
local cancel, listed, legacyBlocked = S.cancel, S.listed, S.legacyBlocked

function S.entityList(id, model, evidence)
    if listed(model, 'Entity list (blacklist/whitelist)', 'Entity list type') then
        cancel(id, 'Entity list (blacklist/whitelist)', evidence)
    end
    local old = F.getProtection()
    if legacyBlocked(model, old.entities, old.allowedEntities) then cancel(id, 'entity_blacklist', evidence) end
end
