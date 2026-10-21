local S = AxiomServerFeatures
local config, on, diagnostic, report, cancel, deleteObserved, provenance, firewall = S.config, S.on, S.diagnostic, S.report, S.cancel, S.deleteObserved, S.provenance, S.firewall

function S.entityFirewallSpawn(id, resource, evidence)
    local mode = resource and firewall(resource)
    if mode == 'log' then
        report(id, 'Entity Firewall (BETA)', evidence)
    elseif mode == 'block' then
        cancel(id, 'Entity Firewall (BETA)', evidence)
    elseif not resource and #(config()['Entity Firewall (BETA)'] or {}) > 0 then
        diagnostic('Entity Firewall (BETA)', 'entity resource provenance unavailable; unknown resources are not attributed or blocked')
    end
end

function S.entityFirewallSample(id, resource, entity, evidence)
    if resource and firewall(resource) == 'block' and on('Entity Firewall: Delete entities') then
        if deleteObserved(id, 'Entity Firewall (BETA)', entity, evidence) then return DoesEntityExist(entity) end
    end
end
