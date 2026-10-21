local C = AxiomClient
local rule = 'Anti god mode V3'
C.register(rule, {
    check = function(s)
        C.observe(rule, C.active(rule) and C.native(rule, 'GetPlayerInvincible_2', s.player) == true,
            { kind = 'invincible_flags_including_keep_ragdoll' })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetPlayerInvincible', player, false)
        C.restoreNative(rule, evidence, 'SetEntityInvincible', ped, false)
        C.restoreNative(rule, evidence, 'SetPlayerInvincibleKeepRagdollEnabled', player, false)
    end
})
