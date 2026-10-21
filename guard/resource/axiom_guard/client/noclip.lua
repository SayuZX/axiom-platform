local C = AxiomClient
local rule = 'Anti noclip'
C.register(rule, {
    check = function(s)
        local condition = not s.excluded and s.airborne and not s.jumping and not s.falling
            and s.speed > C.number('Anti noclip speed threshold (in km/h)', 50)
        C.observe(rule, condition, { speedKmh = s.speed, height = s.height,
            collisionDisabled = GetEntityCollisionDisabled(s.ped),
            limit = C.config['Anti noclip speed threshold (in km/h)'] }, 1000)
    end,
    mitigate = function(ped, player, evidence)
        C.restorePosition(rule, ped, evidence)
    end
})
