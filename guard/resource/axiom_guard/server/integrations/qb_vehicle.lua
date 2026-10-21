-- Load in axiom_guard and, after server/events.lua, in the selected QBCore resource.
-- Wrappers live beside QBCore: exported table copies are never mistaken for live callbacks.
if GetCurrentResourceName() ~= 'axiom_guard' then
    if type(QBCore) ~= 'table' or type(QBCore.ServerCallbacks) ~= 'table' then
        print('[axiom_guard] vehicle bridge requires QBCore server callbacks; load after server/events.lua')
        return
    end
    local installed = {}
    local names = { 'QBCore:Server:SpawnVehicle', 'QBCore:Server:CreateVehicle' }
    local function restore()
        for name, record in pairs(installed) do
            if QBCore.ServerCallbacks[name] == record.wrapper then QBCore.ServerCallbacks[name] = record.original end
        end
        installed = {}
    end
    exports('InstallAxiomVehicleGuard', function()
        if GetInvokingResource() ~= 'axiom_guard' then return false end
        for _, name in ipairs(names) do
            if type(QBCore.ServerCallbacks[name]) ~= 'function' then return false, 'vehicle callback unavailable: ' .. name end
        end
        for _, name in ipairs(names) do
            local record = installed[name]
            if not record or QBCore.ServerCallbacks[name] ~= record.wrapper then
                local original = QBCore.ServerCallbacks[name]
                local wrapper = function(id, cb, model, coords, warp)
                    local ok, allowed = pcall(function()
                        return exports.axiom_guard:ValidateVehicleRequest(id, model, coords)
                    end)
                    if not ok or not allowed then cb(0); return end
                    return original(id, cb, model, coords, warp)
                end
                installed[name] = { original = original, wrapper = wrapper }
                QBCore.ServerCallbacks[name] = wrapper
            end
        end
        return true
    end)
    exports('RemoveAxiomVehicleGuard', function()
        if GetInvokingResource() ~= 'axiom_guard' then return false end
        restore()
        return true
    end)
    AddEventHandler('onResourceStop', function(name)
        if name == 'axiom_guard' then restore() end
    end)
    return
end

AxiomVehicleIntegration = {}
local V, I, resource = AxiomVehicleIntegration, AxiomIntegrations, nil
function V.start()
    local name = I.resource('QBCore')
    local ok, installed, reason = pcall(function() return exports[name]:InstallAxiomVehicleGuard() end)
    if not ok or not installed then
        AxiomServerFeatures.diagnostic('Server vehicle request guard', reason or 'QBCore vehicle bridge unavailable; callbacks are not guarded')
        return false
    end
    resource = name
    return true
end
function V.stop()
    if resource and GetResourceState(resource) == 'started' then
        local ok = pcall(function() exports[resource]:RemoveAxiomVehicleGuard() end)
        if not ok then AxiomServerFeatures.diagnostic('Server vehicle request guard', 'QBCore vehicle bridge removal failed') end
    end
    resource = nil
end
exports('ValidateVehicleRequest', function(id, model, coords)
    if GetInvokingResource() ~= I.resource('QBCore') then return false end
    if not I.selected('QBCore') then return true end
    return AxiomServerFeatures.validateVehicleRequest(id, model, coords)
end)
