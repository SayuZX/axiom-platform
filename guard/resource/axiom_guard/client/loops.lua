local C = AxiomClient
local lastPed, readyAt, nextMenu = 0, nil, 0
C.onReset(function() readyAt, nextMenu = nil, 0 end)
CreateThread(function()
    while true do
        Wait(250)
        local ped, player, now = PlayerPedId(), PlayerId(), GetGameTimer()
        if not C.received or not C.policyFresh() or not C.ready(ped) or ped ~= lastPed then
            C.reset()
            lastPed = ped
        else
            readyAt = readyAt or now
            -- Spawn/control-restoration and fresh-policy baseline grace.
            if now - readyAt >= 10000 then
                local sample = C.input.player(ped, player, now)
                C.run('check', sample)
                C.input.finishMovement(sample)
                C.input.inventory(ped)
                -- Inventory enforcement can remove the previously selected weapon.
                sample.weapon = C.weaponHash(GetSelectedPedWeapon(ped))
                C.run('weapon', sample)
            end
            if now >= nextMenu then
                C.input.menu(now)
                nextMenu = now + 1000
            end
        end
    end
end)
CreateThread(function()
    while true do
        local ped, player = PlayerPedId(), PlayerId()
        local enabled = C.active('Anti infinite ammo') or C.active('Aimbot detection')
            or C.active('Aimbot detection V2') or C.active('Anti SilentAim') or C.active('Anti SilentAim V2')
        local sampling = C.received and C.policyFresh() and C.motion.time and enabled and C.ready(ped)
            and (IsPlayerFreeAiming(player) or IsControlPressed(0, 24) or IsPedShooting(ped))
        if sampling then
            C.input.shot(ped, player, GetGameTimer())
            Wait(25)
        else
            local now = GetGameTimer()
            C.shots.previousAim = nil
            if C.shots.current and now - C.shots.current.time > 350 then C.shots.current = nil end
            if not enabled or not C.ready(ped) or not C.shots.lastShot or now - C.shots.lastShot > 1500 then
                C.resetShots()
            end
            Wait(100)
        end
    end
end)
