-- Streaming-focus heuristic; legitimate scripted focus can match.
local C = AxiomClient
local rule = 'Anti freecam V5'
C.register(rule, {
    check = function(s)
        C.observe(rule, not s.cameraExcluded and not IsEntityFocus(s.ped) and s.renderedDistance > 35,
            { kind = 'streaming_focus_detached_from_ped', distance = s.renderedDistance }, 5000)
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetFocusEntity', ped)
        if evidence.mitigationRequested then evidence.mitigationApplied = IsEntityFocus(ped) end
    end
})
