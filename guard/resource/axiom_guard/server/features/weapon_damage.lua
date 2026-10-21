local S = AxiomServerFeatures
local F = AxiomFullServer
local finite, cancel = S.finite, S.cancel

function S.weaponDamage(id, data, weapon)
    local limit = F.getBaseConfig().damageLimit
    if data.overrideDefaultDamage == true and finite(data.weaponDamage) and finite(limit) and data.weaponDamage > limit then
        cancel(id, 'weapon_damage', { damage = data.weaponDamage, limit = limit, overrideDefaultDamage = true })
    end
end
