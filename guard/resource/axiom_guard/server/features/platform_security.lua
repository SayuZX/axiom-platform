-- Platform-native routing controls; values are server-only and restored on resource stop.
local controls = {
    sv_scriptHookAllowed = 'false',
    sv_enableNetworkedPhoneExplosions = 'false',
    sv_enableNetworkedScriptEntityStates = 'false',
    sv_disableClientReplays = 'true',
    sv_endpointPrivacy = 'true'
}
local original = {}
for key in pairs(controls) do original[key] = GetConvar(key, '') end
CreateThread(function()
    local previous
    while true do
        local protect = AxiomFullServer.getMode() == 'protect'
        if protect ~= previous then
            for key, value in pairs(controls) do SetConvar(key, protect and value or original[key]) end
            previous = protect
        end
        Wait(1000)
    end
end)
AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    for key, value in pairs(original) do SetConvar(key, value) end
end)
