local C = AxiomClient
local rule = 'Max voice proximity'
C.register(rule, {
    check = function(s)
        if not C.active(rule) then return end
        local proximity = C.native(rule, 'MumbleGetTalkerProximity')
        C.observe(rule, C.finite(proximity) and proximity > C.number(rule, 51),
            { proximity = proximity, limit = C.config[rule] })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'MumbleSetTalkerProximity', C.number(rule, 51) + 0.0)
    end
})
