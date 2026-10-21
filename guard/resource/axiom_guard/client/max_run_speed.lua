local C = AxiomClient
local rule = 'Player max run speed (in km/h)'
C.register(rule, {
    check = function(s)
        C.observe(rule, not s.excluded and not s.airborne and not s.jumping and not s.falling
            and s.runSpeed > C.number(rule, 45), { speedKmh = s.runSpeed, limit = C.config[rule] })
    end,
    mitigate = function(ped, player, evidence)
        C.restorePosition(rule, ped, evidence)
    end
})
