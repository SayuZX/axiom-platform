local original = GetConvar('sv_filterRequestControl', '0')
CreateThread(function()
    local previous
    while true do
        local values = AxiomFullServer.getConfig()
        local setting = AxiomFullServer.getMode() == 'protect'
            and ({ Light = '1', Full = '3', None = '0' })[values['Anti remote entity control']] or original
        if setting ~= previous then SetConvar('sv_filterRequestControl', setting); previous = setting end
        Wait(1000)
    end
end)
AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then SetConvar('sv_filterRequestControl', original) end
end)
