local C = AxiomClient
local rule = 'Anti fly'
C.register(rule, {
    check = function(s)
        C.observe(rule, not s.excluded and s.airborne and not s.jumping and not s.falling
            and s.height > 4 and math.abs(GetEntityVelocity(s.ped).z) < 1.5,
            { height = s.height, kind = 'sustained_airborne_hover' }, 3000)
    end,
    mitigate = function(ped, player, evidence)
        C.restorePosition(rule, ped, evidence)
    end
})
