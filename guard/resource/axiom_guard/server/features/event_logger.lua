local S = AxiomServerFeatures
local F = AxiomFullServer
local config, finite, elapsed, state = S.config, S.finite, S.elapsed, S.state

local eventLogWindow = { at = 0, count = 0 }
function S.logEvent(id, name, resource, ...)
    local mode = config()['Server-event logs']
    if mode ~= 'File' and mode ~= 'Full' and mode ~= 'Light' then return end
    local s, player = state(id)
    if not s then return end
    local now = GetGameTimer()
    s.loggedEvents = math.min((s.loggedEvents or 0) + 1, 1000000)
    if s.lastEventLog and elapsed(now, s.lastEventLog) < 5000 then return end
    if elapsed(now, eventLogWindow.at) >= 1000 then eventLogWindow.at, eventLogWindow.count = now, 0 end
    if eventLogWindow.count >= 50 then return end
    eventLogWindow.count = eventLogWindow.count + 1
    s.lastEventLog = now
    local evidence = { event = name, resource = resource, count = s.loggedEvents,
        scope = 'observed engine/configured/integrated events only' }
    s.loggedEvents = 0
    if mode == 'Full' then
        local args = {}
        for i = 1, math.min(select('#', ...), 6) do
            local v = select(i, ...)
            if type(v) == 'string' then args[i] = v:sub(1,128)
            elseif finite(v) or type(v) == 'boolean' then args[i] = v
            elseif type(v) == 'table' then
                local fields, count = {}, 0
                for key, value in pairs(v) do
                    count = count + 1
                    if count > 12 then break end
                    if type(key) == 'string' and #key <= 64 then
                        if type(value) == 'string' then fields[key] = value:sub(1,128)
                        elseif finite(value) or type(value) == 'boolean' then fields[key] = value end
                    end
                end
                args[i] = fields
            else args[i] = '[' .. type(v) .. ' omitted]' end
        end
        evidence.arguments, evidence.argumentTrust = args, 'untrusted; bounded primitive arguments only'
    end
    if mode == 'File' then
        evidence.player = player
        print('[axiom_guard:event] ' .. json.encode(evidence))
    else F.report(player, 'Server-event logs', evidence, mode == 'Full' and 'client' or 'server') end
end
