-- Observable camera heuristic, not a private algorithm. Legitimate scripted cameras can match.
local C = AxiomClient
local rule = 'Anti freecam'
C.register(rule, {
    check = function(s)
        C.observe(rule, not s.cameraExcluded and s.gameplayDistance > 35,
            { kind = 'gameplay_camera_distance', distance = s.gameplayDistance }, 3000)
    end
})
