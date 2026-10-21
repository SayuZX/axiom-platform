AxiomDashboard = {}
local pending, cooldowns, identities = {}, {}, {}
local endpoint = GetConvar('axiom_guard_url', 'http://127.0.0.1:3013/anticheat'):gsub('/+$', '')
local ingestToken = GetConvar('axiom_guard_token', '')

local function reply(id, message)
    local line = '[axiom_guard] ' .. message
    if id == 0 then print(line) else TriggerClientEvent('axiom_guard:commandResult', id, line) end
end

local function dashboardUrl(value)
    if type(value) ~= 'string' or #value > 2048 then return nil end
    local authority, path = value:match('^https://([^/]+)(/.*)$')
    if not authority then authority = value:match('^https://([^/]+)$'); path = '/' end
    if not authority then return nil end
    local host, port = authority:match('^([%w%.%-]+):(%d+)$')
    host = host or authority
    if port and (tonumber(port) < 1 or tonumber(port) > 65535) then return nil end
    if #host > 253 or not host:match('^[%w%.%-]+$') or host:find('..', 1, true) then return nil end
    if host:sub(1, 1) == '.' or host:sub(-1) == '.' then return nil end
    for label in host:gmatch('[^.]+') do
        if #label > 63 or not label:match('^[%w]') or not label:match('[%w]$') then return nil end
    end
    if not path:match('^/[%w%._~/%-]*$') or path:find('//', 1, true) then return nil end
    for segment in path:gmatch('[^/]+') do if segment == '.' or segment == '..' then return nil end end
    return 'https://' .. authority .. (path:sub(-1) == '/' and path or path .. '/')
end

function AxiomDashboard.allowed(id)
    if IsPlayerAceAllowed(id, 'axiom_guard.dashboard') then return true end
    local values = AxiomBackend.configSnapshot().fullConfig.values
    local identifiers = GetPlayerIdentifiers(id)
    for _, entry in ipairs(values['Admin identifier list'] or {}) do
        if type(entry) == 'string' then
            if entry:sub(1, 4) == 'ace:' then
                if #entry > 4 and IsPlayerAceAllowed(id, entry:sub(5)) then return true end
            else
                for _, identifier in ipairs(identifiers) do if identifier == entry then return true end end
            end
        end
    end
    return false
end

local function machineRequest(path, body, callback)
    local authority, basePath = endpoint:match('^http://([^/]+)(/.*)$')
    if not authority then authority = endpoint:match('^http://([^/]+)$'); basePath = '' end
    local host, port = (authority or ''):match('^([^:]+):(%d+)$')
    host = host or authority
    if (host ~= '127.0.0.1' and host ~= 'localhost') or (port and (tonumber(port) < 1 or tonumber(port) > 65535))
        or not basePath or not basePath:match('^[%w%._~/%-]*$') or basePath:find('..', 1, true) or basePath:find('//', 1, true) or ingestToken == '' then
        callback(0, '')
        return
    end
    local ok = pcall(PerformHttpRequest, endpoint .. '/api/' .. path, callback, 'POST', json.encode(body),
        { ['Content-Type'] = 'application/json', ['Authorization'] = 'Bearer ' .. ingestToken }, { followLocation = false })
    if not ok then callback(0, '') end
end

local function sameIdentity(left, right)
    return left and right and left.playerId == right.playerId and left.playerName == right.playerName
        and left.playerSession == right.playerSession and left.serverSession == right.serverSession and left.license == right.license
end

local function revoke(identity)
    machineRequest('nui-revoke', identity, function() end)
end

RegisterCommand('axiomguard', function(id)
    if id == 0 then reply(id, 'Run /axiomguard in-game to open the dashboard.'); return end
    if not AxiomDashboard.allowed(id) then reply(id, 'Dashboard access denied. Ask an administrator for axiom_guard.dashboard permission.'); return end
    if pending[id] or (cooldowns[id] and GetGameTimer() - cooldowns[id] < 2000) then return end
    local url = dashboardUrl(GetConvar('axiom_guard_dashboard_url', 'https://axiomcreative.xyz/anticheat/'))
    if not url then reply(id, 'Dashboard URL is invalid. Configure axiom_guard_dashboard_url as an HTTPS base URL without credentials, query or fragment.'); return end
    local identity = AxiomFullServer.dashboardIdentity(id)
    if not identity then reply(id, 'Player session is not ready. Try /axiomguard again.'); return end
    local request = { identity = identity }
    pending[id], identities[id], cooldowns[id] = request, identity, GetGameTimer()
    SetTimeout(8000, function()
        if pending[id] ~= request then return end
        pending[id] = nil
        reply(id, 'Dashboard authentication timed out. Try /axiomguard again.')
    end)
    machineRequest('nui-ticket', identity, function(status, body)
        local decoded, result = false, nil
        if status == 200 and type(body) == 'string' and #body <= 4096 then decoded, result = pcall(json.decode, body) end
        local ticket = decoded and type(result) == 'table' and result.ticket or nil
        if type(ticket) ~= 'string' or #ticket ~= 43 or not ticket:match('^[%w_-]+$') then ticket = nil end
        local current = pending[id] == request
        if current then pending[id] = nil end
        if not current or not sameIdentity(identity, AxiomFullServer.dashboardIdentity(id)) or not AxiomDashboard.allowed(id) then
            -- A late response must not revoke a newer opening for this same player session.
            if ticket and (identities[id] == identity or not sameIdentity(identity, identities[id])) then revoke(identity) end
            return
        end
        if not ticket then reply(id, 'Dashboard authentication unavailable. Try /axiomguard again.'); return end
        TriggerClientEvent('axiom_guard:dashboardOpen', id, url, ticket)
    end)
end, false)

AddEventHandler('playerDropped', function()
    local id = tonumber(source)
    local identity = identities[id]
    pending[id], cooldowns[id], identities[id] = nil, nil, nil
    if identity then revoke(identity) end
end)
