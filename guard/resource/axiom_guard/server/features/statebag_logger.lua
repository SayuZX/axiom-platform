local S = AxiomServerFeatures
local elapsed, on, native, state, report, netEntity = S.elapsed, S.on, S.native, S.state, S.report, S.netEntity

local statebagCookie, bagWindow = nil, { at = 0, count = 0, suppressed = 0 }
function S.statebagChanged(bag, key, _, _, replicated)
    if not on('Log all statebag events') then return end
    local now = GetGameTimer()
    if elapsed(now, bagWindow.at) >= 1000 then bagWindow.at, bagWindow.count = now, 0 end
    bagWindow.count = bagWindow.count + 1
    if bagWindow.count > 50 then bagWindow.suppressed = math.min(bagWindow.suppressed + 1, 1000000); return end
    if type(bag) ~= 'string' or type(key) ~= 'string' then return end
    local id = tonumber(bag:match('^player:(%d+)$'))
    if not id then
        local netId = tonumber(bag:match('^entity:(%d+)$'))
        local entity = netId and netEntity(netId)
        if entity then id = NetworkGetEntityOwner(entity) end
    end
    if id and state(id) then
        report(id, 'Log all statebag events', { bag = bag:sub(1,96), key = key:sub(1,96),
            replicated = replicated == true, writer = 'unknown; player is bag owner, not proven writer', suppressed = bagWindow.suppressed })
    elseif bagWindow.count == 1 then
        print(('[axiom_guard] statebag metadata bag=%q key=%q writer=unknown'):format(bag:sub(1,96), key:sub(1,96)))
    end
end
function S.syncStatebagHandler()
    if on('Log all statebag events') and not statebagCookie then
        statebagCookie = native('AddStateBagChangeHandler', 'Log all statebag events', nil, nil, S.statebagChanged)
    elseif not on('Log all statebag events') and statebagCookie then
        native('RemoveStateBagChangeHandler', 'Log all statebag events', statebagCookie)
        statebagCookie = nil
    end
end
