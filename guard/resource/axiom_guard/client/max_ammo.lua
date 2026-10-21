local C = AxiomClient
local rule = 'Client max ammo'
C.register(rule, {
    inventory = function(s)
        if s.owned and C.active(rule) and not C.whitelisted('Infinite ammo weapon whitelist', s.weapon) then
            local ammo = GetAmmoInPedWeapon(s.ped, s.weapon)
            if ammo > C.number(rule, 250) then
                C.signal(rule, { weapon = s.weapon, ammo = ammo, limit = C.config[rule] })
            end
        end
    end,
    weapon = function(s)
        if s.weapon == C.unarmed or C.whitelisted('Infinite ammo weapon whitelist', s.weapon) then
            C.streak[rule] = nil
            return
        end
        local ammo = GetAmmoInPedWeapon(s.ped, s.weapon)
        C.observe(rule, ammo > C.number(rule, 250), { weapon = s.weapon, ammo = ammo, limit = C.config[rule] })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetPedAmmo', ped, evidence.weapon, math.floor(C.number(rule, 250)))
        if evidence.mitigationRequested then
            evidence.mitigationApplied = GetAmmoInPedWeapon(ped, evidence.weapon) <= C.number(rule, 250)
        end
    end
})
