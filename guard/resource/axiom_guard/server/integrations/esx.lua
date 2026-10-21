-- Also load this file inside ESX, after server/functions.lua and classes/player.lua:
-- server_script '@axiom_guard/server/integrations/esx.lua'
-- The bridge owns its closures in ESX; a guard restart cannot invalidate player methods.
local guardResource = 'axiom_guard'
local resource = GetCurrentResourceName()

if resource == guardResource then
    local I = AxiomIntegrations
    local activeResource
    local adapter = {}

    exports('AxiomESXMoneyEnabled', function()
        return GetInvokingResource() == I.resource('ESX') and I.selected('ESX')
            and GetResourceState(I.resource('ESX')) == 'started'
    end)

    function adapter.start(name)
        local ok, accepted, err = pcall(function() return exports[name]:AxiomESXMoneyStart() end)
        if not ok then
            return nil, 'ESX owner-side bridge unavailable; load @axiom_guard/server/integrations/esx.lua in ESX after its player/functions scripts and restart ESX: ' .. tostring(accepted)
        end
        if accepted ~= true then return nil, tostring(err or 'ESX bridge refused activation') end
        activeResource = name
        return true
    end

    function adapter.stop(name)
        name = activeResource or name
        activeResource = nil
        if name and GetResourceState(name) == 'started' then
            local ok, stopped, err = pcall(function() return exports[name]:AxiomESXMoneyStop() end)
            if not ok or stopped ~= true then error(tostring(ok and err or stopped)) end
        end
    end

    function adapter.status()
        if not activeResource then return { protectedPlayers = 0, pendingReconnect = 0 } end
        local ok, status = pcall(function() return exports[activeResource]:AxiomESXMoneyStatus() end)
        if ok and type(status) == 'table' then return status end
        return { detail = 'ESX bridge status unavailable: ' .. tostring(status) }
    end

    I.register('ESX', adapter)
    return
end

local function callable(value)
    if type(value) == 'function' then return true end
    if type(value) ~= 'table' then return false end
    local meta = getmetatable(value)
    return value.__cfx_functionReference ~= nil or type(meta) == 'table' and type(meta.__call) == 'function'
end

assert(type(ESX) == 'table' and callable(ESX.RegisterPlayerFunctionOverrides)
    and callable(ESX.GetExtendedPlayers) and callable(ESX.GetPlayerFromId),
    'Load the Axiom ESX bridge after ESX server/functions.lua and server/classes/player.lua')

local overrideKey = 'axiom_guard:money'
local methods = { setAccountMoney = 'set', addAccountMoney = 'add', removeAccountMoney = 'remove' }
local records = setmetatable({}, { __mode = 'k' })
local enabled, lastError = false, nil

local function finite(value)
    return type(value) == 'number' and value == value and value > -math.huge and value < math.huge
end

local function authorized()
    return GetInvokingResource() == guardResource
end

local function selected()
    if not enabled or GetResourceState(guardResource) ~= 'started' then return false end
    local ok, result = pcall(function() return exports[guardResource]:AxiomESXMoneyEnabled() end)
    if not ok then
        lastError = 'ESX selection check failed: ' .. tostring(result)
        return nil
    end
    return result == true
end

local function track(player, balances, identity, origin)
    local ok, accepted, err = pcall(function()
        return exports[guardResource]:TrackBalances(player.source, balances, identity, origin)
    end)
    if not ok or accepted ~= true then
        lastError = 'ESX balance tracking failed: ' .. tostring(ok and err or accepted)
        return false
    end
    return true
end

local overrides = {}
for method, operation in pairs(methods) do
    overrides[method] = function(player)
        local original = player[method]
        if not callable(original) then return original end
        local record = records[player]
        if not record then
            record = { originals = {}, wrappers = {}, active = true }
            records[player] = record
        end
        local wrapper = function(accountName, amount, ...)
            if not record.active then return original(accountName, amount, ...) end
            local selection = selected()
            if selection == false then return original(accountName, amount, ...) end
            if selection == nil then return false end
            if ESX.GetPlayerFromId(player.source) ~= player then return false end

            -- Let ESX produce its native errors for invalid account/argument shapes.
            if type(amount) ~= 'number' or (operation == 'set' and amount < 0)
                or (operation ~= 'set' and amount <= 0) then
                return original(accountName, amount, ...)
            end
            if not finite(amount) then return false end
            local account = player.getAccount(accountName)
            if not account then return original(accountName, amount, ...) end
            local rounded = account.round and ESX.Math.Round(amount) or amount
            local balances = player.getAccounts(true)
            if type(balances) ~= 'table' or not finite(balances[account.name]) or not finite(rounded) then return false end
            local proposed = operation == 'set' and rounded
                or balances[account.name] + (operation == 'remove' and -rounded or rounded)
            if not finite(proposed) then return false end

            local identity = player.getIdentifier()
            local origin = GetInvokingResource()
            if not track(player, balances, identity) then return false end
            -- getAccounts(true) is a new snapshot; never mutate the player's accounts here.
            balances[account.name] = proposed
            local ok, accepted, err = pcall(function()
                return exports[guardResource]:GuardBalances(player.source, balances, identity, origin)
            end)
            if not ok then
                lastError = 'ESX precommit guard failed: ' .. tostring(accepted)
                return false
            end
            if accepted ~= true then
                lastError = err and ('ESX money operation rejected: ' .. tostring(err)) or nil
                return false
            end

            local result = table.pack(original(accountName, amount, ...))
            track(player, player.getAccounts(true), identity, origin)
            return table.unpack(result, 1, result.n)
        end
        record.originals[method], record.wrappers[method] = original, wrapper
        return wrapper
    end
end

local function stop()
    enabled = false
    -- RegisterPlayerFunctionOverrides assigns this index directly; nil removes only ours.
    ESX.RegisterPlayerFunctionOverrides(overrideKey, nil)
    for player, record in pairs(records) do
        record.active = false
        for method, wrapper in pairs(record.wrappers) do
            if player[method] == wrapper then player[method] = record.originals[method] end
        end
    end
    records = setmetatable({}, { __mode = 'k' })
    return true
end

exports('AxiomESXMoneyStart', function()
    if not authorized() then return false, 'axiom_guard caller required' end
    if enabled then return true end
    lastError = nil
    ESX.RegisterPlayerFunctionOverrides(overrideKey, overrides)
    enabled = true
    return true
end)

exports('AxiomESXMoneyStop', function()
    if not authorized() then return false, 'axiom_guard caller required' end
    return stop()
end)

exports('AxiomESXMoneyStatus', function()
    if not authorized() then return nil end
    local protected, pending, conflicts = 0, 0, 0
    for _, player in pairs(ESX.GetExtendedPlayers()) do
        local record = records[player]
        local covered = enabled and record and record.active
        if covered then
            for method in pairs(methods) do
                if not record.wrappers[method] or player[method] ~= record.wrappers[method] then covered = false; break end
            end
        end
        if covered then
            protected = protected + 1
        else
            pending = pending + 1
            if record and record.active then conflicts = conflicts + 1 end
        end
    end
    return {
        protectedPlayers = protected, pendingReconnect = pending, conflictingOverrides = conflicts,
        detail = 'ESX factories cover new sessions only; existing sessions need reconnect. Competing money overrides require resolution.',
        lastError = lastError,
    }
end)

AddEventHandler('onResourceStop', function(name)
    if tonumber(source) and tonumber(source) > 0 then return end
    if name == guardResource or name == resource then stop() end
end)
