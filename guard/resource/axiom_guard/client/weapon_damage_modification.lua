local C = AxiomClient
local rule = 'Anti weapon damage modification'
C.register(rule, {
    weapon = function(s)
        if s.weapon == C.unarmed then C.streak[rule] = nil end
        if C.whitelisted('Anti weapon damage whitelist', s.weapon) then C.streak[rule] = nil; return end
        if not C.active(rule) then return end
        local limit = C.number('Max weapon damage modifier', 1)
        local modifier = C.native(rule, 'GetWeaponDamageModifier', s.weapon)
        C.observe(rule, C.finite(modifier) and modifier > limit + 0.001,
            { kind = 'weapon_damage_multiplier', weapon = s.weapon, modifier = modifier, limit = limit })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetWeaponDamageModifier', evidence.weapon,
            C.number('Max weapon damage modifier', 1) + 0.0)
    end
})
