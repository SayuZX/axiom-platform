local C = AxiomClient
local rule = 'Blacklisted weapons'
C.register(rule, {
    inventory = function(s)
        if s.owned and (C.hashes[rule] or {})[s.weapon] then
            C.signal(rule, { weapon = s.weapon, kind = 'weapon_possession' })
        end
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'RemoveWeaponFromPed', ped, evidence.weapon)
        C.inventory.owned[evidence.weapon] = HasPedGotWeapon(ped, evidence.weapon, false)
        if evidence.mitigationRequested then evidence.mitigationApplied = not C.inventory.owned[evidence.weapon] end
    end
})
