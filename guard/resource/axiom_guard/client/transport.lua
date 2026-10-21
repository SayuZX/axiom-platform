-- All values originate on an untrusted client. They are observations, never proof.
CreateThread(function()
    while true do
        Wait(15000)
        if NetworkIsPlayerActive(PlayerId()) then
            local ped = PlayerPedId()
            if DoesEntityExist(ped) then
                TriggerServerEvent('axiom_guard:observation', {
                    health = GetEntityHealth(ped),
                    maxHealth = GetEntityMaxHealth(ped),
                    armor = GetPedArmour(ped),
                    invincible = GetPlayerInvincible_2(PlayerId())
                })
            end
        end
    end
end)
-- Restricted server commands reply only to their invoker, without chat dependency.
RegisterNetEvent('axiom_guard:commandResult', function(message)
    if source ~= 65535 or type(message) ~= 'string' then return end
    print(message)
end)
