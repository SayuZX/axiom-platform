local C = AxiomClient
local rule = 'Player max health'
C.register(rule, {
    check = function(s)
        local health = GetEntityHealth(s.ped)
        C.observe(rule, health > C.number(rule, 200), { health = health, limit = C.config[rule] })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetEntityHealth', ped, math.floor(C.number(rule, 200)))
        if evidence.mitigationRequested then evidence.mitigationApplied = GetEntityHealth(ped) <= C.number(rule, 200) end
    end
})
