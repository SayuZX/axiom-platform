local original = GetConvar('sv_enableNetworkedSounds', 'true')
CreateThread(function()
    local previous
    while true do
        local setting = AxiomFullServer.getMode() == 'protect'
            and AxiomFullServer.getConfig()['Disable networked sounds'] and 'false' or original
        if setting ~= previous then SetConvar('sv_enableNetworkedSounds', setting); previous = setting end
        Wait(1000)
    end
end)
AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then SetConvar('sv_enableNetworkedSounds', original) end
end)
