local S = AxiomServerFeatures
local explosion = S.explosion
local config, set, cancel = S.config, S.set, S.cancel

function S.explosionList(id, data, kind)
    local found = set('Explosion list (blacklist/whitelist)', explosion)[kind] == true
    if config()['Explosion list type'] == 'Whitelist' and not found
        or config()['Explosion list type'] == 'Blacklist' and found then
        cancel(id, 'Explosion list (blacklist/whitelist)', { explosionType = kind })
    end
end
