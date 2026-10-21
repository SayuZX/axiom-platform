local B = AxiomBackend
local MAX_EVENTS, MAX_IDENTITIES = 2000, 20000
local history, saved, corrupt = B.loadStore('history', { identities = {}, events = {} })
history.identities, history.events = history.identities or {}, history.events or {}
history.eventHead = history.eventHead or 1
local seen = {}
for _, event in ipairs(history.events) do if event.key then seen[event.key] = true end end
B.history = history
local lastError, observationCount = nil, 0
local dirty, lastFlush = false, nil

local function mergeStrings(target, values, maximum)
    local lookup = {}
    for _, value in ipairs(target) do lookup[value] = true end
    for _, value in ipairs(values) do
        if not lookup[value] then
            target[#target + 1], lookup[value] = value, true
            if #target > maximum then lookup[table.remove(target, 1)] = nil end
        end
    end
end

local function remember(target, name, identifiers, at)
    local strong = B.strongIdentifiers(identifiers)
    local uid = B.primary(strong)
    if not uid then return nil end
    local identity = target.identities[uid]
    if not identity then
        identity = { uid = uid, name = '', firstSeen = at, lastSeen = at, identifiers = {}, addresses = {}, highDetections = {},
            serverDetections = 0, clientDetections = 0, connections = 0 }
        target.identities[uid] = identity
    end
    if B.text(name, 128) and at >= identity.lastSeen then identity.name = name end
    identity.firstSeen, identity.lastSeen = math.min(identity.firstSeen, at), math.max(identity.lastSeen, at)
    mergeStrings(identity.identifiers, strong, 128)
    mergeStrings(identity.addresses, B.addresses(identifiers), 64)
    return uid, identity
end

local function validEvent(event)
    if type(event) ~= 'table' or not B.text(event.key, 160) or not B.text(event.kind, 64) or not B.text(event.rule, 256)
        or not B.text(event.severity, 16) or type(event.details) ~= 'table' then return nil, 'Invalid local event' end
    local encoded, raw = pcall(json.encode, event)
    if not encoded or #raw > 12288 then return nil, 'Local event exceeds 12 KiB or is invalid' end
    if not B.array(event.details.identifiers or {}, 32) then return nil, 'Invalid event identifiers' end
    for _, id in ipairs(event.details.identifiers or {}) do if not B.text(id, 160) then return nil, 'Invalid event identifier' end end
    return true
end

local function appendEvent(target, event)
    local copy = B.copy(event)
    local at = B.epoch(event.at) or os.time()
    local uid, identity = remember(target, event.playerName, event.details.identifiers, at)
    copy.uid = uid
    local trust = event.details.trust
    local client = type(trust) == 'string' and (trust:lower():find('client', 1, true) ~= nil)
    copy.trustClass = client and 'client' or (type(trust) == 'string' and trust:sub(1, 6) == 'SERVER' and 'server' or 'unclassified')
    if identity then
        if event.kind == 'connection' then identity.connections = identity.connections + 1 end
        if event.kind == 'detection' then
            if copy.trustClass == 'client' then identity.clientDetections = identity.clientDetections + 1
            elseif copy.trustClass == 'server' then
                identity.serverDetections = identity.serverDetections + 1
                if event.severity == 'high' and at >= os.time() - 30 * 86400 then
                    local recent = {}
                    for _, previous in ipairs(identity.highDetections) do if previous >= os.time() - 30 * 86400 then recent[#recent + 1] = previous end end
                    recent[#recent + 1] = at
                    table.sort(recent)
                    while #recent > 8 do table.remove(recent, 1) end
                    identity.highDetections = recent
                end
            end
        end
    end
    if #target.events < MAX_EVENTS then target.events[#target.events + 1] = copy
    else
        local replaced = target.events[target.eventHead]
        if replaced then seen[replaced.key] = nil end
        target.events[target.eventHead] = copy
        target.eventHead = target.eventHead % MAX_EVENTS + 1
    end
    return true
end

local function trimIdentities(target)
    local count, candidates, protected = 0, {}, {}
    local bans = B.banSnapshot()
    for _, ban in ipairs(bans.bans) do protected[ban.uid] = true end
    for _, entry in ipairs(bans.whitelist) do protected[entry.uid] = true end
    for uid, identity in pairs(target.identities) do
        count = count + 1
        if not protected[uid] and (#identity.highDetections == 0 or identity.highDetections[#identity.highDetections] < os.time() - 30 * 86400) then
            candidates[#candidates + 1] = { uid = uid, at = identity.lastSeen }
        end
    end
    if count <= MAX_IDENTITIES then return end
    table.sort(candidates, function(a, b) return a.at < b.at end)
    for index = 1, math.min(count - MAX_IDENTITIES, #candidates) do target.identities[candidates[index].uid] = nil end
end

if not saved and not corrupt then
    local bootstrap = B.bootstrap()
    for _, identity in ipairs(type(bootstrap.identities) == 'table' and bootstrap.identities or {}) do
        if type(identity) == 'table' then
            local ids = B.copy(type(identity.identifiers) == 'table' and identity.identifiers or {})
            for _, address in ipairs(type(identity.addresses) == 'table' and identity.addresses or {}) do if B.ipv4(address) then ids[#ids + 1] = 'ip:' .. address end end
            local _, stored = remember(history, identity.name, ids, B.epoch(identity.lastSeen) or os.time())
            if stored then stored.firstSeen = B.epoch(identity.firstSeen) or stored.firstSeen end
        end
    end
    for _, event in ipairs(type(bootstrap.events) == 'table' and bootstrap.events or {}) do
        if validEvent(event) and not seen[event.key] and appendEvent(history, event) then seen[event.key] = true end
    end
    trimIdentities(history)
    local ok, err = B.saveStore('history', history)
    if not ok then lastError, dirty = err, true else lastFlush = B.stamp() end
    seen = {}
    for _, event in ipairs(history.events) do seen[event.key] = true end
end

local function observe(server, events)
    if type(server) ~= 'table' or not B.array(events, 500) then return nil, 'Invalid backend observation' end
    local accepted, batchSeen = {}, {}
    for _, event in ipairs(events) do
        local valid, err = validEvent(event)
        if not valid then return nil, err end
        if not seen[event.key] and not batchSeen[event.key] then
            batchSeen[event.key] = true
            accepted[#accepted + 1] = event
        end
    end
    if #events == 0 then
        local at = os.time()
        for _, player in ipairs(type(server.players) == 'table' and server.players or {}) do
            if type(player) == 'table' and B.array(player.identifiers, 32) then
                remember(history, player.name, player.identifiers, at)
                dirty = true
            end
        end
    end
    for _, event in ipairs(accepted) do
        appendEvent(history, event)
        seen[event.key], dirty = true, true
        if AxiomWebhook and type(AxiomWebhook.enqueue) == 'function' then
            local safe, queued, err = pcall(AxiomWebhook.enqueue, server, event)
            if not safe or (queued == nil and err) then
                lastError = 'Webhook enqueue: ' .. tostring(safe and err or queued)
                print('[AXIOM BACKEND] ' .. lastError)
            end
        end
    end
    observationCount = observationCount + #accepted
    return true -- Accepted in memory; history is flushed below, not on the gameplay path.
end

function B.observe(server, events)
    local safe, result, err = pcall(observe, server, events)
    if not safe then lastError = tostring(result); print('[AXIOM BACKEND] Observation failed: ' .. lastError); return nil, lastError end
    return result, err
end

-- A crash can lose at most the unflushed five-second history window. Ban/config
-- commits and webhook outbox persistence remain synchronous and independent.
function B.flushHistory()
    if not dirty then return true end
    trimIdentities(history)
    local ok, err = B.saveStore('history', history)
    if not ok then lastError = err; return nil, err end
    dirty, lastError, lastFlush = false, nil, B.stamp()
    return true
end

CreateThread(function()
    while true do
        Wait(5000)
        local ok, err = pcall(B.flushHistory)
        if not ok then lastError = tostring(err); print('[AXIOM BACKEND] History flush: ' .. lastError) end
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() then
        local ok, err = pcall(B.flushHistory)
        if not ok then print('[AXIOM BACKEND] Final history flush: ' .. tostring(err)) end
    end
end)

function B.snapshot()
    local config = B.configSnapshot()
    return { config = config.config, fullConfig = config.fullConfig, protection = config.protection, bans = B.banSnapshot() }
end

function B.acceptDashboard(response)
    local ok, err = B.acceptConfig(response)
    if not ok then return nil, err end
    if response.bans ~= nil then
        ok, err = B.acceptBans(response.bans)
        if not ok then return nil, err end
    end
    if response.webhooks ~= nil then
        if not AxiomWebhook or type(AxiomWebhook.configureMany) ~= 'function' then return nil, 'Lua webhook backend unavailable' end
        return AxiomWebhook.configureMany(response.webhooks)
    end
    return true
end

function B.status()
    local identities, clients, servers = 0, 0, 0
    for _, identity in pairs(history.identities) do
        identities = identities + 1
        clients, servers = clients + identity.clientDetections, servers + identity.serverDetections
    end
    return { mode = B.configState.config.mode, revision = B.configState.revision, dashboardRevision = B.configState.remote.revision,
        activeBans = #B.banSnapshot().bans, identities = identities, events = #history.events, observed = observationCount,
        clientDetections = clients, serverDetections = servers, lastError = lastError, storage = B.storageStatus(), dirty = dirty, lastFlush = lastFlush,
        webhook = AxiomWebhook and AxiomWebhook.status and AxiomWebhook.status() or { available = false } }
end

local function parseJson(value)
    if type(value) ~= 'string' then return nil, 'JSON required' end
    local ok, parsed = pcall(json.decode, value)
    if not ok then return nil, 'Invalid JSON' end
    return parsed
end

RegisterCommand('guard_backend', function(source, args, rawCommand)
    if source ~= 0 then return end
    local operation = args[1] or 'status'
    local ok, err
    if operation == 'status' then print('[AXIOM BACKEND] ' .. json.encode(B.status())); return
    elseif operation == 'mode' then ok, err = B.setMode(args[2])
    elseif operation == 'config' then
        local action = args[2]
        if action == 'json' then
            local rawJson = rawCommand:match('^%S+%s+config%s+json%s+(.+)$')
            local changes, problem = parseJson(rawJson)
            if problem then err = problem else ok, err = B.saveConfig(changes) end
        elseif action == 'set' then
            local keyJson, valueJson = rawCommand:match('^%S+%s+config%s+set%s+(".-")%s+(.+)$')
            local key, keyError = parseJson(keyJson)
            local value, valueError = parseJson(valueJson)
            if keyError or valueError or type(key) ~= 'string' or value == nil or value == json.null then err = keyError or valueError or 'Use config set "Control name" <JSON value>'
            else ok, err = B.saveConfig({ [key] = value }) end
        else print('[AXIOM BACKEND] ' .. json.encode(B.configSnapshot())); return end
    elseif operation == 'bans' then print('[AXIOM BACKEND] ' .. json.encode(B.banSnapshot())); return
    elseif operation == 'unban' then ok, err = B.unban(args[2] or '')
    elseif operation == 'whitelist' and (args[2] == 'add' or args[2] == 'remove') then ok, err = B.whitelist(args[3], args[2] == 'remove')
    else
        print('guard_backend status | mode monitor/protect | config set "Control name" <JSON value> | config json <JSON object> | config | bans | unban <id> | whitelist add/remove <uid>')
        return
    end
    print('[AXIOM BACKEND] ' .. (ok and 'Saved durably.' or ('Not saved: ' .. tostring(err))))
end, true)
