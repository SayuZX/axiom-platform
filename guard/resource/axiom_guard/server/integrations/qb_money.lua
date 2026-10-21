-- Also load inside QBCore after server/player.lua. Native owner closures survive guard restarts.
local guardResource, resource = 'axiom_guard', GetCurrentResourceName()
if resource == guardResource then
    local I, core, activeResource = AxiomIntegrations
    local function vehicle(method)
        if not AxiomVehicleIntegration then return end
        local ok, err = pcall(AxiomVehicleIntegration[method], core)
        if not ok then print('[axiom_guard] QBCore vehicle guard: ' .. tostring(err)) end
    end
    exports('AxiomQBMoneyEnabled', function()
        return GetInvokingResource() == I.resource('QBCore') and I.selected('QBCore')
            and AxiomFullServer.getConfig()['Framework money guard'] == true
    end)
    I.register('QBCore', {
        start = function(name)
            core = exports[name]:GetCoreObject()
            if type(core) ~= 'table' or type(core.Functions) ~= 'table' then return nil, 'QBCore API unavailable' end
            local ok, accepted, err = pcall(function() return exports[name]:AxiomQBMoneyStart() end)
            if not ok or accepted ~= true then
                return nil, 'Load @axiom_guard/server/integrations/qb_money.lua after QBCore server/player.lua and restart QBCore: ' .. tostring(ok and err or accepted)
            end
            activeResource = name
            vehicle('start')
            return true
        end,
        stop = function(name)
            vehicle('stop')
            name = activeResource or name
            activeResource = nil
            if core and GetResourceState(name) == 'started' then
                local ok, accepted, err = pcall(function() return exports[name]:AxiomQBMoneyStop() end)
                if not ok or accepted ~= true then error(tostring(ok and err or accepted)) end
            end
            core = nil
        end,
        status = function()
            if not activeResource then return { players = 0 } end
            return exports[activeResource]:AxiomQBMoneyStatus()
        end,
    })
    return
end

assert(type(QBCore) == 'table' and type(QBCore.Functions) == 'table', 'Load Axiom QBCore bridge after server/player.lua')
local enabled, lastError = false, nil
local records = {}
local function finite(value)
    return type(value) == 'number' and value == value and math.abs(value) < math.huge
end
local function callable(value)
    if type(value) == 'function' then return true end
    local meta = type(value) == 'table' and getmetatable(value)
    return type(value) == 'table' and (value.__cfx_functionReference ~= nil or type(meta) == 'table' and type(meta.__call) == 'function')
end
local function sameBalances(a, b)
    for key, value in pairs(a) do if b[key] ~= value then return false end end
    for key in pairs(b) do if a[key] == nil then return false end end
    return true
end
local function track(player, identity, origin)
    local ok, accepted, err = pcall(function()
        return exports[guardResource]:TrackBalances(player.PlayerData.source, player.PlayerData.money, identity, origin)
    end)
    if not ok or accepted ~= true then lastError = tostring(ok and err or accepted); return false end
    return true
end
local function install(player)
    if not enabled or type(player) ~= 'table' or player.Offline or type(player.PlayerData) ~= 'table' then return end
    local id, identity = player.PlayerData.source, player.PlayerData.citizenid
    if QBCore.Functions.GetPlayer(id) ~= player or records[id] and records[id].player == player then return end
    local record = { player = player, originals = {}, wrappers = {}, active = true }
    records[id] = record
    for _, method in ipairs({ 'AddMoney', 'RemoveMoney', 'SetMoney' }) do
        local original = player.Functions[method]
        assert(callable(original), 'QBCore money method unavailable: ' .. method)
        record.originals[method] = original
        local wrapper = function(account, amount, ...)
            if not enabled or not record.active or GetResourceState(guardResource) ~= 'started' then return original(account, amount, ...) end
            local selectionOK, selected = pcall(function() return exports[guardResource]:AxiomQBMoneyEnabled() end)
            if not selectionOK then lastError = tostring(selected); return false end
            if selected ~= true then return original(account, amount, ...) end
            if QBCore.Functions.GetPlayer(id) ~= player or player.PlayerData.citizenid ~= identity then return false end
            if type(account) ~= 'string' then return false end
            account, amount = account:lower(), tonumber(amount)
            if not finite(amount) or amount < 0 then return false end
            local current = player.PlayerData.money
            if type(current) ~= 'table' or not finite(current[account]) then return false end
            -- BillingBank.Set may yield before mutation. Reject concurrent writes until the
            -- prior proposal is visible; synchronous postcommit callbacks may safely reenter.
            if record.pending and not sameBalances(current, record.pending) then return false end
            local origin = GetInvokingResource()
            if not track(player, identity, record.pendingOrigin) then return false end
            local proposed = {}
            for key, value in pairs(current) do proposed[key] = value end
            proposed[account] = method == 'SetMoney' and amount or current[account] + (method == 'RemoveMoney' and -amount or amount)
            if not finite(proposed[account]) then return false end
            local ok, accepted, err = pcall(function() return exports[guardResource]:GuardBalances(id, proposed, identity, origin) end)
            if not ok or accepted ~= true then lastError = tostring(ok and err or accepted); return false end
            local pending, pendingOrigin = record.pending, record.pendingOrigin
            record.pending, record.pendingOrigin = proposed, origin
            local result = table.pack(pcall(original, account, amount, ...))
            -- Track actual state even when an original errors after committing or returns nil.
            if QBCore.Functions.GetPlayer(id) == player then track(player, identity, origin) end
            if pending then
                for key in pairs(pending) do pending[key] = player.PlayerData.money[key] end
            end
            record.pending, record.pendingOrigin = pending, pendingOrigin
            if not result[1] then error(result[2], 0) end
            return table.unpack(result, 2, result.n)
        end
        record.wrappers[method] = wrapper
        player.Functions[method] = wrapper
    end
    track(player, identity)
end
local function stop()
    enabled = false
    for _, record in pairs(records) do
        record.active = false
        for method, wrapper in pairs(record.wrappers) do
            if record.player.Functions[method] == wrapper then record.player.Functions[method] = record.originals[method] end
        end
    end
    records = {}
    return true
end
exports('AxiomQBMoneyStart', function()
    if GetInvokingResource() ~= guardResource then return false, 'axiom_guard caller required' end
    if enabled then return true end
    enabled, lastError = true, nil
    local ok, err = pcall(function() for _, player in pairs(QBCore.Functions.GetQBPlayers()) do install(player) end end)
    if not ok then stop(); return false, tostring(err) end
    return true
end)
exports('AxiomQBMoneyStop', function()
    if GetInvokingResource() ~= guardResource then return false, 'axiom_guard caller required' end
    return stop()
end)
exports('AxiomQBMoneyStatus', function()
    if GetInvokingResource() ~= guardResource then return nil end
    local count, conflicts = 0, 0
    for _, record in pairs(records) do
        count = count + 1
        for method, wrapper in pairs(record.wrappers) do
            if record.player.Functions[method] ~= wrapper then conflicts = conflicts + 1 end
        end
    end
    return { players = count, conflictingOverrides = conflicts, lastError = lastError }
end)
AddEventHandler('QBCore:Server:PlayerLoaded', function(player)
    if tonumber(source) and tonumber(source) > 0 then return end
    install(player)
end)
AddEventHandler('QBCore:Server:OnPlayerUnload', function(id)
    if tonumber(source) and tonumber(source) > 0 then return end
    local record = records[tonumber(id)]
    if record then record.active = false end
    records[tonumber(id)] = nil
end)
AddEventHandler('playerDropped', function()
    local record = records[tonumber(source)]
    if record then record.active = false end
    records[tonumber(source)] = nil
end)
AddEventHandler('onResourceStop', function(name)
    if tonumber(source) and tonumber(source) > 0 then return end
    if name == guardResource or name == resource then stop() end
end)
