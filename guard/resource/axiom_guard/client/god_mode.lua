local C = AxiomClient
local rule = 'Anti god mode'
C.register(rule, {
    check = function(s)
        C.observe(rule, C.active(rule) and C.native(rule, 'GetPlayerInvincible', s.player) == true,
            { kind = 'player_invincible' })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetPlayerInvincible', player, false)
        C.restoreNative(rule, evidence, 'SetEntityInvincible', ped, false)
    end
})
