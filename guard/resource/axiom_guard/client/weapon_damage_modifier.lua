local C = AxiomClient
local rule = 'Max weapon damage modifier'
C.register(rule, {
    weapon = function(s)
        if C.whitelisted('Anti weapon damage whitelist', s.weapon) then C.streak[rule] = nil; return end
        if not C.active(rule) then return end
        local limit = C.number(rule, 1)
        local gun = C.native(rule, 'GetPlayerWeaponDamageModifier', s.player)
        local melee = C.native(rule, 'GetPlayerMeleeWeaponDamageModifier', s.player)
        C.observe(rule, (C.finite(gun) and gun > limit + 0.001) or (C.finite(melee) and melee > limit + 0.001),
            { kind = 'player_damage_multiplier', weapon = s.weapon, gun = gun, melee = melee, limit = limit })
    end,
    mitigate = function(ped, player, evidence)
        local limit = C.number(rule, 1) + 0.0
        if C.finite(evidence.gun) and evidence.gun > limit then
            C.restoreNative(rule, evidence, 'SetPlayerWeaponDamageModifier', player, limit)
        end
        if C.finite(evidence.melee) and evidence.melee > limit then
            C.restoreNative(rule, evidence, 'SetPlayerMeleeWeaponDamageModifier', player, limit)
        end
    end
})
