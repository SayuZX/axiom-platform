local C = AxiomClient
local rule = 'Anti invisible'
C.register(rule, {
    check = function(s)
        local alpha = GetEntityAlpha(s.ped)
        C.observe(rule, not IsEntityVisible(s.ped) or alpha < 150, { alpha = alpha })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetEntityVisible', ped, true, false)
        C.restoreNative(rule, evidence, 'ResetEntityAlpha', ped)
        if evidence.mitigationRequested then
            evidence.mitigationApplied = IsEntityVisible(ped) and GetEntityAlpha(ped) == 255
        end
    end
})
