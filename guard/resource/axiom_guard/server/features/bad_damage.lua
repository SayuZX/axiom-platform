local S = AxiomServerFeatures
local F = AxiomFullServer
local finite, on, cancel = S.finite, S.on, S.cancel

function S.badDamage(id, data, weapon)
    local limit = F.getBaseConfig().damageLimit
    if data.overrideDefaultDamage == true and finite(data.weaponDamage) and on('Anti bad damage')
        and (data.weaponDamage < 0 or finite(limit) and data.weaponDamage > limit) then
        cancel(id, 'Anti bad damage', { damage = data.weaponDamage, limit = limit, weapon = weapon })
    end
end
