-- Rendered-camera motion heuristic; legitimate scripted cameras can match.
local C = AxiomClient
local rule = 'Anti freecam V2'
local previousCamera
C.register(rule, {
    check = function(s)
        local detachedMotion = previousCamera and s.previousPosition
            and C.distance(s.rendered, previousCamera) > 2 and C.distance(s.position, s.previousPosition) < 0.25
        C.observe(rule, not s.cameraExcluded and s.renderedDistance > 20 and detachedMotion,
            { kind = 'rendered_camera_moves_without_ped', distance = s.renderedDistance }, 1500)
        previousCamera = s.rendered
    end,
    reset = function()
        previousCamera = nil
    end
})
