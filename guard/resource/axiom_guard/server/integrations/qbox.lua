-- Qbox's native hooks receive already-rounded amounts before mutation.
local I, R = AxiomIntegrations, AxiomRules
local active
local adapter = {}

local function diagnostic(message)
    print('[axiom_guard] Qbox money guard: ' .. tostring(message))
end

local function enabled(record)
    return active == record and I.selected('Qbox') and I.resource('Qbox') == record.resource
        and GetResourceState(record.resource) == 'started'
end

local function playerData(resource, id)
    if not R.finite(id) or id <= 0 or id % 1 ~= 0 then error('invalid player source') end
    local player = exports[resource]:GetPlayer(id)
    local data = type(player) == 'table' and player.PlayerData
    if not data or player.Offline or type(data) ~= 'table' or data.source ~= id
        or type(data.citizenid) ~= 'string' or data.citizenid == '' or type(data.money) ~= 'table' then
        error('current online player, identity and balances required')
    end
    for account, balance in pairs(data.money) do
        if type(account) ~= 'string' or account == '' or not R.finite(balance) then
            error('invalid authoritative balance hash')
        end
    end
    return data
end

local function guard(record, operation, payload)
    if not enabled(record) then return true end
    if type(payload) ~= 'table' then error('invalid money hook payload') end
    -- Qbox supplies no source for offline characters; gameplay enforcement does not apply.
    if payload.source == nil then return true end
    if type(payload.moneyType) ~= 'string' or not R.finite(payload.amount) or payload.amount < 0 then
        error('invalid money hook account or amount')
    end
    local data = playerData(record.resource, payload.source)
    local current = data.money[payload.moneyType]
    if not R.finite(current) then error('unknown money account') end
    local proposed = {}
    for account, balance in pairs(data.money) do proposed[account] = balance end
    if operation == 'setMoney' then proposed[payload.moneyType] = payload.amount
    elseif operation == 'removeMoney' then proposed[payload.moneyType] = current - payload.amount
    else proposed[payload.moneyType] = current + payload.amount end
    if not R.finite(proposed[payload.moneyType]) then error('proposed balance overflow') end
    local tracked, trackError = exports.axiom_guard:TrackBalances(payload.source, data.money, data.citizenid)
    if not tracked then error(trackError or 'committed baseline rejected') end
    local allowed, guardError = exports.axiom_guard:GuardBalances(payload.source, proposed, data.citizenid)
    if allowed ~= true and guardError then diagnostic(guardError) end
    return allowed == true
end

local function remove(record)
    if GetResourceState(record.resource) ~= 'started' then return end
    for _, id in ipairs(record.hooks) do
        local ok, err = pcall(function() exports[record.resource]:removeHooks(id) end)
        if not ok then diagnostic('hook removal failed: ' .. tostring(err)) end
    end
end

function adapter.stop()
    local record = active
    active = nil -- Retained callbacks become inert even if the framework cannot remove them.
    if record then remove(record) end
end

function adapter.start(resource)
    adapter.stop()
    if not I.selected('Qbox') or I.resource('Qbox') ~= resource or GetResourceState(resource) ~= 'started' then
        return nil, 'selected Qbox resource is not started'
    end
    local record = { resource = resource, hooks = {} }
    local ok, err = pcall(function()
        for _, operation in ipairs({ 'addMoney', 'removeMoney', 'setMoney' }) do
            local id = exports[resource]:registerHook(operation, function(payload)
                -- Qbox ignores thrown hook errors; return false explicitly to fail closed.
                local success, result = pcall(guard, record, operation, payload)
                if not success then diagnostic(result); return false end
                return result
            end)
            if not R.finite(id) or id <= 0 or id % 1 ~= 0 then error('registerHook returned an invalid hook id') end
            record.hooks[#record.hooks + 1] = id
        end
    end)
    if not ok then
        remove(record)
        diagnostic(err)
        return nil, tostring(err)
    end
    active = record
    return true
end

AddEventHandler('QBCore:Server:OnMoneyChange', function(id)
    if tonumber(source) and tonumber(source) > 0 then return end
    local record = active
    if not record or not enabled(record) or GetInvokingResource() ~= record.resource then return end
    local ok, err = pcall(function()
        local data = playerData(record.resource, id)
        local tracked, trackError = exports.axiom_guard:TrackBalances(id, data.money, data.citizenid)
        if not tracked then error(trackError or 'postcommit tracking rejected') end
    end)
    if not ok then diagnostic(err) end
end)

I.register('Qbox', adapter)
