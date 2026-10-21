-- Optional framework adapters; no automatic resource detection or mandatory dependency.
AxiomIntegrations = {}
local I = AxiomIntegrations
local adapters, states = {}, {}
local defaults = { QBCore = 'qb-core', ESX = 'es_extended', Qbox = 'qbx_core', ox_inventory = 'ox_inventory' }
function I.selected(name)
    local values = AxiomFullServer.getConfig()
    if name == 'ox_inventory' then return values['Inventory integration'] == name end
    return values['Framework integration'] == name and (values['Framework money guard'] == true
        or name == 'QBCore' and values['Server vehicle request guard'] == true)
end
function I.resource(name)
    local values = AxiomFullServer.getConfig()
    return values[name == 'ox_inventory' and 'Inventory resource' or (name .. ' resource')] or defaults[name]
end
function I.callable(value)
    return type(value) == 'function' or type(value) == 'table' and (value.__cfx_functionReference ~= nil or getmetatable(value) and getmetatable(value).__call ~= nil)
end
function I.register(name, adapter)
    assert(defaults[name] and type(adapter) == 'table' and type(adapter.start) == 'function' and type(adapter.stop) == 'function', 'Invalid framework adapter')
    adapters[name] = adapter
    states[name] = { active = false }
end
local function stop(name)
    local state, adapter = states[name], adapters[name]
    if not state.active then return end
    local ok, err = pcall(adapter.stop, state.resource)
    state.active, state.error = false, ok and nil or tostring(err)
end
function I.refresh()
    for name, adapter in pairs(adapters) do
        local state, resource = states[name], I.resource(name)
        local valid = type(resource) == 'string' and #resource <= 64 and resource:match('^[%w_][%w_.%-]*$')
        local selected = I.selected(name)
        local running = valid and GetResourceState(resource) == 'started'
        if state.active and (not selected or not running or state.resource ~= resource) then stop(name) end
        local signature = tostring(selected) .. ':' .. tostring(resource) .. ':' .. tostring(running)
        if state.signature ~= signature then
            state.signature, state.error, state.resource = signature, nil, resource
            if selected and not running then state.error = 'Selected resource is not started: ' .. tostring(resource)
            elseif selected and not state.active then
                local safe, ok, err = pcall(adapter.start, resource)
                state.active = safe and ok == true
                if not state.active then
                    pcall(adapter.stop, resource)
                    state.error = tostring(safe and err or ok)
                end
            end
            if state.error then print('[axiom_guard] ' .. name .. ': ' .. state.error) end
        end
    end
end
function I.status()
    local output = {}
    for name, state in pairs(states) do
        output[name] = { selected = I.selected(name), active = state.active, resource = state.resource, error = state.error }
        if state.active and adapters[name].status then
            local ok, details = pcall(adapters[name].status)
            if ok then output[name].details = details end
        end
    end
    return output
end
RegisterCommand('guard_integrations', function(source)
    if source == 0 then print('[axiom_guard] ' .. json.encode(I.status())) end
end, true)
AddEventHandler('onResourceStop', function(resource)
    for name, state in pairs(states) do
        if resource == GetCurrentResourceName() or resource == state.resource then stop(name); state.signature = nil end
    end
end)
CreateThread(function() while true do I.refresh(); Wait(1000) end end)
