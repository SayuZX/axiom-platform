local C = AxiomClient
local rule = 'Anti client weapon spoofing V2'
C.register(rule, {
    weapon = function(s)
        if s.weapon == C.unarmed then C.streak[rule] = nil; return end
        local object = GetCurrentPedWeaponEntityIndex(s.ped, 0)
        local expected = GetWeapontypeModel(s.weapon)
        C.observe(rule, object ~= 0 and DoesEntityExist(object) and expected ~= 0 and GetEntityModel(object) ~= expected,
            { kind = 'equipped_weapon_model_mismatch', weapon = s.weapon,
                model = object ~= 0 and GetEntityModel(object) or 0, expected = expected }, 3000)
    end
})
