local C = AxiomClient
local rule = 'Anti god mode V2'
C.register(rule, {
    check = function(s)
        C.observe(rule, C.active(rule) and C.native(rule, 'GetEntityCanBeDamaged', s.ped) == false,
            { kind = 'entity_damage_disabled' })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetEntityCanBeDamaged', ped, true)
    end
})
