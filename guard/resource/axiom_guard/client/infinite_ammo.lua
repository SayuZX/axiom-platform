local C = AxiomClient
local rule = 'Anti infinite ammo'
local previous
C.register(rule, {
    sample = function(s)
        s.previousAmmo = previous
        if not previous or previous.weapon ~= s.weapon or s.reload or s.ammo < previous.amount
            or C.whitelisted('Infinite ammo weapon whitelist', s.weapon) then
            C.shotCounts[rule] = nil
        end
        previous = { weapon = s.weapon, amount = s.ammo }
    end,
    shot = function(s)
        local before = s.previousAmmo
        if not s.reload and before and before.weapon == s.weapon
            and not C.whitelisted('Infinite ammo weapon whitelist', s.weapon) then
            C.accumulate(rule, s.ammo >= before.amount,
                { kind = 'shots_without_ammo_decrease', weapon = s.weapon, ammo = s.ammo }, 8, s.now)
        end
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetPedInfiniteAmmo', ped, false, evidence.weapon)
        C.restoreNative(rule, evidence, 'SetPedInfiniteAmmoClip', ped, false)
    end,
    resetShot = function()
        previous = nil
    end
})
