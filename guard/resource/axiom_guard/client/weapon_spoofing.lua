local C = AxiomClient
local rule = 'Anti client weapon spoofing'
C.register(rule, {
    weapon = function(s)
        if s.weapon == C.unarmed then C.streak[rule] = nil; return end
        local equipped, current = GetCurrentPedWeapon(s.ped, true)
        C.observe(rule, IsPedShooting(s.ped) and (not HasPedGotWeapon(s.ped, s.weapon, false)
            or (equipped and C.weaponHash(current) ~= s.weapon)),
            { kind = 'shooting_weapon_inventory_mismatch', weapon = s.weapon, current = current }, 200)
    end
})
