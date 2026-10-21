local C = AxiomClient
local rule = 'Player max armour'
C.register(rule, {
    check = function(s)
        local armour = GetPedArmour(s.ped)
        C.observe(rule, armour > C.number(rule, 100), { armour = armour, limit = C.config[rule] })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetPedArmour', ped, math.floor(C.number(rule, 100)))
        if evidence.mitigationRequested then evidence.mitigationApplied = GetPedArmour(ped) <= C.number(rule, 100) end
    end
})
