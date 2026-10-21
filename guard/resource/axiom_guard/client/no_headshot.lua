-- Documented CPED_CONFIG_FLAG_NoCriticalHits (2), not a fabricated getter.
local C = AxiomClient
local rule = 'Anti no headshot'
C.register(rule, {
    check = function(s)
        C.observe(rule, GetPedConfigFlag(s.ped, 2, true), { kind = 'no_critical_hits_flag' })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetPedSuffersCriticalHits', ped, true)
        if evidence.mitigationRequested then evidence.mitigationApplied = not GetPedConfigFlag(ped, 2, true) end
    end
})
