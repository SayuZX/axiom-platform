local C = AxiomClient
local rule = 'Anti super jump'
local jumpStart, jumpZ
C.register(rule, {
    check = function(s)
        if s.excluded or not s.airborne then
            jumpStart, jumpZ = nil, nil
        elseif s.jumping and not jumpStart then
            jumpStart, jumpZ = s.now, s.previousPosition and s.previousPosition.z or s.position.z
        end
        if C.active(rule) and jumpStart then
            local airtime, rise = s.now - jumpStart, s.position.z - jumpZ
            if airtime >= C.number('Super jump detection time (in ms)', 400) and rise > 3 then
                C.signal(rule, { airtimeMs = airtime, rise = rise,
                    limitMs = C.config['Super jump detection time (in ms)'] })
            end
        end
    end,
    mitigate = function(ped, player, evidence)
        C.restorePosition(rule, ped, evidence)
    end,
    reset = function()
        jumpStart, jumpZ = nil, nil
    end
})
