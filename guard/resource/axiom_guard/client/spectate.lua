local C = AxiomClient
local rule = 'Anti spectate'
C.register(rule, {
    check = function(s)
        C.observe(rule, NetworkIsInSpectatorMode(), { kind = 'spectator_mode' })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'NetworkSetInSpectatorMode', false, ped)
        if evidence.mitigationRequested then evidence.mitigationApplied = not NetworkIsInSpectatorMode() end
    end
})
