local C = AxiomClient
local rule = 'Anti ragdoll'
C.register(rule, {
    check = function(s)
        C.observe(rule, not CanPedRagdoll(s.ped) and not s.vehicle, { kind = 'ragdoll_disabled' }, 5000)
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetPedCanRagdoll', ped, true)
        if evidence.mitigationRequested then evidence.mitigationApplied = CanPedRagdoll(ped) end
    end
})
