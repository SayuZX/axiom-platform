local C = AxiomClient
local rule = 'Anti teleport to waypoint'
local waypoint
C.register(rule, {
    check = function(s)
        if C.active(rule) and waypoint and s.elapsed > 0 and s.elapsed < 2000
            and s.previousPosition and C.distance(s.position, s.previousPosition) > 100 then
            local dx, dy = s.position.x - waypoint.x, s.position.y - waypoint.y
            if dx * dx + dy * dy < 400 then
                C.signal(rule, { displacement = C.distance(s.position, s.previousPosition),
                    waypointDistance = math.sqrt(dx * dx + dy * dy), elapsedMs = s.elapsed })
            end
        end
        local blip = GetFirstBlipInfoId(8)
        waypoint = DoesBlipExist(blip) and GetBlipInfoIdCoord(blip) or nil
    end,
    mitigate = function(ped, player, evidence)
        C.restorePosition(rule, ped, evidence)
    end,
    reset = function()
        waypoint = nil
    end
})
