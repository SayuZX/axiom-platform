-- Script-camera state heuristic; legitimate scripted cameras can match.
local C = AxiomClient
local rule = 'Anti freecam V3'
C.register(rule, {
    check = function(s)
        local camera = GetRenderingCam()
        local scripted = camera ~= -1 and camera ~= 0 and DoesCamExist(camera)
            and IsCamActive(camera) and IsCamRendering(camera)
        C.observe(rule, not s.cameraExcluded and scripted and not IsGameplayCamRendering(),
            { kind = 'active_scripted_render_camera', camera = camera }, 5000)
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'RenderScriptCams', false, false, 0, true, true)
        C.restoreNative(rule, evidence, 'ClearFocus')
    end
})
