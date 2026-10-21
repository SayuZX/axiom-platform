local S = AxiomServerFeatures
local on, report = S.on, S.report

function S.damageTracking(id, data, weapon)
    if on('Player damage tracking') then
        report(id, 'Player damage tracking', { weapon = weapon, target = data.hitGlobalId,
            damage = data.overrideDefaultDamage and data.weaponDamage or nil, lethal = data.willKill == true })
    end
end
