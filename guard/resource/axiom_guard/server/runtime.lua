local R = AxiomRules
local B = AxiomBackend
local config = R.config(R.defaults)
local configAt
local startedAt = GetGameTimer()
local players, queue = {}, {}
local inFlight, dropped, suppressed = false, 0, 0
local sequence = 0
local session = ('%x-%08x-%08x'):format(os.time(), math.random(0, 0x7fffffff), math.random(0, 0x7fffffff))
local endpoint = GetConvar('axiom_guard_url', 'http://127.0.0.1:3013/anticheat'):gsub('/+$', '')
local token = GetConvar('axiom_guard_token', '')
local lastTransport = 'not contacted'
local MAX_QUEUE, BATCH_SIZE = 500, 100
local protection, banPolicy = {}, { bans = {}, whitelist = {} }
local resultQueue, executed = {}, {}
local pendingDrops = {}
local pendingResults = 0
local connectionSequence = 0
local fullValues, fullClient, fullRevision = {}, {}, 0

local function licenseOf(ids)
    for _, id in ipairs(ids) do if id:match('^license:') then return id end end
    for _, id in ipairs(ids) do if id:match('^license2:') then return id end end
end

local function positionOf(id)
    local ped = GetPlayerPed(id)
    if ped == 0 or not DoesEntityExist(ped) then return nil end
    local point = GetEntityCoords(ped)
    return { x = point.x, y = point.y, z = point.z }
end

local function exempt(state)
    if fullValues['Admins bypass anti-cheat'] then
        for _, entry in ipairs(fullValues['Admin identifier list'] or {}) do
            if type(entry) == 'string' and entry:sub(1, 4) == 'ace:' and IsPlayerAceAllowed(state.id, entry:sub(5)) then return true end
            for _, id in ipairs(state.identifiers) do if id == entry then return true end end
        end
    end
    return protection.adminBypass == true and IsPlayerAceAllowed(state.id, 'axiom_guard.bypass')
        or R.inZone(positionOf(state.id), fullValues['Detection whitelisting zones'] or protection.zones)
end

local function enabled(state, rule)
    return R.rule(protection, rule) and not exempt(state)
end


local function text(value, maximum)
    if type(value) ~= 'string' then return '' end
    if not utf8.len(value) then return '' end
    local result = value:gsub('%z', ''):sub(1, maximum)
    while not utf8.len(result) do result = result:sub(1, -2) end
    return result
end

local serverName = text(GetConvar('axiom_guard_server', 'AXIOM Roleplay'), 128)

local function identifiers(id)
    local result = {}
    for _, value in ipairs(GetPlayerIdentifiers(id)) do
        if #result == 32 then break end
        result[#result + 1] = text(value, 160)
    end
    return result
end

local function playerId(value)
    local id = tonumber(value)
    if R.finite(id) and id > 0 and id % 1 == 0 then return id end
end

local function stateFor(value)
    local id = playerId(value)
    if not id then return nil end
    local state = players[id]
    if state then return state end
    local name = GetPlayerName(id)
    if not name then return nil end
    local now = GetGameTimer()
    connectionSequence = connectionSequence + 1
    state = { id = id, name = text(name, 128), identifiers = identifiers(id),
        sessionId = session .. ':' .. connectionSequence,
        windows = {}, cooldowns = {}, joinedAt = now, lastObservation = now }
    players[id] = state
    return state
end

local function effectiveMode(now)
    return config.mode == 'protect' and R.fresh(config, configAt, now) and 'protect' or 'monitor'
end

local function enqueue(kind, state, rule, severity, details)
    sequence = sequence + 1
    details.identifiers = state and state.identifiers or {}
    if #json.encode(details) > 8192 then dropped = dropped + 1; return false end
    local event = {
        key = session .. ':' .. sequence, at = os.date('!%Y-%m-%dT%H:%M:%SZ'),
        kind = kind, playerId = state and state.id or json.null,
        playerName = state and state.name or '', rule = rule,
        severity = severity, details = details
    }
    B.observe({ name = serverName, sessionId = session, mode = effectiveMode(GetGameTimer()),
        players = state and {{ id = state.id, name = state.name, identifiers = state.identifiers, sessionId = state.sessionId }} or {} }, {event})
    if token == '' then return true end
    local reserved = inFlight and #inFlight or 0
    if #queue + reserved >= MAX_QUEUE then dropped = dropped + 1 else queue[#queue + 1] = event end
    return true
end

local function commandResult(command, status, message, data)
    pendingResults = pendingResults - 1
    resultQueue[#resultQueue + 1] = {
        id = command.id, key = command.key, playerSession = command.playerSession,
        serverSession = command.serverSession, status = status, message = text(message, 512), data = data
    }
end

local function finishDrop(pending, status, message, reason)
    if pending.finished then return end
    pending.finished = true
    if pendingDrops[pending.state.id] == pending then pendingDrops[pending.state.id] = nil end
    if pending.command then
        commandResult(pending.command, status, message, { reason = reason, action = status == 'completed' and 'kicked' or 'kick-failed' })
    end
    enqueue('system', pending.state, 'native_kick', status == 'completed' and 'info' or 'high', {
        trust = 'SERVER OBSERVED', action = status == 'completed' and 'kicked' or 'kick-failed',
        playerSession = pending.state.sessionId, serverSession = session,
        reason = reason or pending.reason, message = message, test = pending.command and pending.command.test == true or false
    })
end

local function nativeKick(state, reason, command)
    if pendingDrops[state.id] then
        if command then commandResult(command, 'failed', 'A native kick is already pending for this player.') end
        return
    end
    local pending = { state = state, reason = reason, command = command }
    if not command or command.test ~= true then
        local message = fullValues['Default kick message'] or '[AXIOM GUARD] {reason}'
        local detail = reason:gsub('^%[AXIOM GUARD%]%s*', '')
        if message:find('{reason}', 1, true) then reason = message:gsub('{reason}', function() return detail end) else reason = message .. ' ' .. detail end
        reason = text(reason, 1024)
        pending.reason = reason
    end
    pendingDrops[state.id] = pending
    SetTimeout(15000, function() finishDrop(pending, 'failed', 'Native kick did not receive playerDropped within 15 seconds.') end)
    local ok, err = pcall(DropPlayer, state.id, reason)
    if not ok then finishDrop(pending, 'failed', 'DropPlayer failed: ' .. text(tostring(err), 256)) end
end
local function report(state, rule, severity, details, cooldown, bucket)
    local now = GetGameTimer()
    local key = bucket or rule
    local previous = state.cooldowns[key]
    if previous and R.elapsed(now, previous) < cooldown then suppressed = suppressed + 1; return false end
    if R.hit(state.windows, 'reports', now, 12) then suppressed = suppressed + 1; return false end
    if not enqueue('detection', state, rule, severity, details) then return false end
    state.cooldowns[key] = now
    return true
end

local function configuredAction(state, rule, trust)
    if fullValues[rule] == false then return 'none' end
    return R.action(protection, rule, config, configAt, GetGameTimer(), trust or 'server', exempt(state))
end
local function violation(state, rule, evidence, trust, cancellable)
    trust = trust or 'server'
    local action = configuredAction(state, rule, trust)
    if action == 'none' then return action end
    local _, requested = R.rule(protection, rule)
    local blocked = action == 'cancel' or action == 'kick' or action == 'ban'
    -- Engine event cancellation is synchronous; evidence cooldown cannot allow a flood.
    if cancellable and blocked then CancelEvent() end
    if pendingDrops[state.id] then return action end
    local recorded = 'observed'
    if action == 'kick' or action == 'ban' then recorded = action .. '-requested'
    elseif action == 'cancel' then
        recorded = cancellable and 'cancelled' or evidence.operationRejected and 'operation-rejected'
            or evidence.mitigationApplied and 'mitigated' or (evidence.remedyRequested or evidence.mitigationRequested) and 'mitigation-requested' or 'observed'
    elseif requested ~= 'monitor' then recorded = 'would-' .. requested end
    local queued = report(state, rule, trust == 'server' and 'high' or 'medium', {
        trust = trust == 'server' and 'SERVER OBSERVED' or 'CLIENT REPORT', action = recorded, evidence = evidence,
        enforcement = action == 'ban' and 'lua-ban-request' or nil,
        playerSession = state.sessionId, serverSession = session
    }, 10000)
    if action == 'kick' and queued then nativeKick(state, '[AXIOM GUARD] Detection: ' .. rule) end
    if action == 'ban' and queued then
        local banId, err = B.ban(state, rule, evidence)
        if banId then
            banPolicy = B.snapshot().bans
            enqueue('system', state, 'local_ban_created', 'high', { trust = 'SERVER PERSISTED', action = 'banned', banId = banId, reason = rule })
            nativeKick(state, '[AXIOM GUARD] Local ban #' .. tostring(banId) .. ': ' .. rule)
        else enqueue('system', state, 'ban_storage_failed', 'high', { action = 'not-banned', reason = text(tostring(err), 256) }) end
    end
    return action
end
local function fullReport(id, rule, evidence, trust)
    local state = stateFor(id)
    if not state or exempt(state) or type(rule) ~= 'string' or #rule > 128 or type(evidence) ~= 'table' then return false end
    local setting = fullValues[rule]
    local ruleConfig = fullValues['Detection settings'] and fullValues['Detection settings'][rule]
    if setting == false or (ruleConfig and ruleConfig.enabled == false) then return false end
    return report(state, rule, trust == 'server' and 'medium' or 'low', {
        trust = trust == 'server' and 'SERVER OBSERVATION' or 'LOW TRUST: client supplied',
        action = 'observed', evidence = evidence, playerSession = state.sessionId, serverSession = session
    }, 10000)
end
AxiomFullServer = {
    getConfig = function() return fullValues end,
    getBaseConfig = function() return config end,
    getProtection = function() return protection end,
    getMode = function() return effectiveMode(GetGameTimer()) end,
    report = fullReport,
    dashboardIdentity = function(id)
        local state = stateFor(id)
        if not state then return nil end
        local license = licenseOf(state.identifiers)
        if not license then return nil end
        return { playerId = state.id, playerName = text(GetPlayerName(state.id), 128),
            playerSession = state.sessionId, serverSession = session, license = license }
    end,
    action = function(id, rule)
        local state = stateFor(id)
        return state and configuredAction(state, rule, 'server') or 'none'
    end,
    enforce = function(id, rule, evidence)
        local state = stateFor(id)
        return state and violation(state, rule, evidence, 'server', false) or 'none'
    end,
    allowed = function(id) local state = stateFor(id); return not state or exempt(state) end,
    cancel = function(id, rule, evidence)
        local state = stateFor(id)
        if not state or exempt(state) then return false end
        local action = violation(state, rule, evidence, 'server', true)
        return action == 'cancel' or action == 'kick' or action == 'ban'
    end
}
local function sendClientPolicy(state, force)
    local rules = protection.clientPolicy or {}
    local values = (force or state.sentRevision ~= fullRevision) and fullClient or nil
    local remaining = configAt and math.max(0, config.heartbeatTimeout * 1000 - R.elapsed(GetGameTimer(), configAt)) or 0
    TriggerClientEvent('axiom_guard:fullConfig', state.id, values, fullRevision,
        { mode = effectiveMode(GetGameTimer()), ttlMs = remaining, exempt = exempt(state), rules = rules })
    state.sentRevision = fullRevision
end
local function refreshLocal()
    local snapshot = B.snapshot()
    local nextConfig = snapshot and R.config(snapshot.config)
    if not nextConfig then return false end
    config, configAt = nextConfig, GetGameTimer()
    protection, banPolicy = snapshot.protection, snapshot.bans
    local incoming = snapshot.fullConfig
    if incoming.revision ~= fullRevision then
        fullValues, fullClient, fullRevision = incoming.values, incoming.clientValues, incoming.revision
        for _, state in pairs(players) do state.sentRevision = nil end
    end
    return true
end
assert(refreshLocal(), 'Axiom Lua backend configuration unavailable')
RegisterNetEvent('axiom_guard:requestFullConfig', function()
    local state = stateFor(source)
    if not state or R.hit(state.windows, 'configRequests', GetGameTimer(), 2) then return end
    sendClientPolicy(state, true)
end)
RegisterNetEvent('axiom_guard:signal', function(rule, evidence)
    local state = stateFor(source)
    if not state or R.hit(state.windows, 'fullSignals', GetGameTimer(), 12) then return end
    if type(rule) ~= 'string' or fullClient[rule] == nil or type(evidence) ~= 'table' or evidence.revision ~= fullRevision then return end
    local clean, count = {}, 0
    for key, value in pairs(evidence) do
        count = count + 1
        if count > 12 or type(key) ~= 'string' or #key > 40 then return end
        if type(value) == 'string' then value = text(value, 128)
        elseif type(value) ~= 'boolean' and not R.finite(value) then return end
        clean[key] = value
    end
    if clean.kind == 'native_unavailable' or clean.diagnostic == true then fullReport(state.id, rule, clean, 'client'); return end
    violation(state, rule, clean, 'client', false)
end)


RegisterNetEvent('axiom_guard:observation', function(data)
    local state = stateFor(source)
    if not state then return end
    local now = GetGameTimer()
    if R.hit(state.windows, 'observationInput', now, 3) then return end
    if type(data) ~= 'table' or type(data.invincible) ~= 'boolean' then return end
    for _, key in ipairs({ 'health', 'maxHealth', 'armor' }) do
        if not R.finite(data[key]) or data[key] % 1 ~= 0 or math.abs(data[key]) > 1000000 then return end
    end
    state.lastObservation = now
    state.missingReported = false
    if not enabled(state, 'client_observation') then return end
    local last = state.cooldowns.client_observation
    if last and R.elapsed(now, last) < 60000 then return end
    if enqueue('system', state, 'client_observation', 'low', {
        trust = 'LOW TRUST: client supplied', action = 'observation only; never enforced',
        health = data.health, maxHealth = data.maxHealth, armor = data.armor,
        invincible = data.invincible,
        note = 'Legitimate scripts can change these values; client reports can be forged or suppressed.'
    }) then state.cooldowns.client_observation = now end
end)

AddEventHandler('playerConnecting', function(_, _, deferrals)
    local id = source
    local state = stateFor(id)
    if not state or exempt(state) or fullRevision == 0 then return end
    deferrals.defer()
    Wait(0)
    local done = false
    local function finish(reason)
        if done then return end
        done = true
        deferrals.done(reason)
    end
    SetTimeout(8000, function() finish() end)
    B.admit(state.identifiers, function(decision)
        if done then return end
        if players[id] ~= state or type(decision) ~= 'table' then finish(); return end
        local denying = decision.allowed == false and effectiveMode(GetGameTimer()) == 'protect'
        for _, finding in ipairs(decision.findings or {}) do
            enqueue('detection', state, finding.rule, finding.observeOnly and 'low' or 'high', {
                trust = 'SERVER IDENTIFIERS', action = denying and not finding.observeOnly and 'connection-denied' or 'observed', evidence = finding })
        end
        local reason = denying and decision.reason
        finish(reason and ('[AXIOM GUARD] ' .. text(reason, 512)) or nil)
    end, state.id)
end)

AddEventHandler('playerJoining', function(oldId)
    players[playerId(oldId) or 0] = nil
    local id = playerId(source)
    if not id then return end
    if pendingDrops[id] then finishDrop(pendingDrops[id], 'failed', 'Player session replaced before drop confirmation.') end
    players[id] = nil
    local state = stateFor(id)
    if state then enqueue('connection', state, 'player_joined', 'info', { trust = 'SERVER OBSERVED' }) end
end)

AddEventHandler('playerDropped', function(reason)
    local id = playerId(source)
    if not id then return end
    local pending = pendingDrops[id]
    if pending then
        if not players[id] or players[id].sessionId == pending.state.sessionId then
            finishDrop(pending, 'completed', 'Native kick confirmed by playerDropped.', text(reason, 512))
        else
            finishDrop(pending, 'failed', 'Player session changed before playerDropped.')
        end
    end
    local state = players[id] or (pending and pending.state) or stateFor(id)
    if state then
        enqueue('disconnection', state, 'player_left', 'info', {
            trust = 'SERVER OBSERVED', reason = text(reason, 512)
        })
    end
    players[id] = nil
end)

-- Server-only reporting API; NOT middleware and never cancels its caller's event.
-- exports.axiom_guard:ReportDetection(playerId, rule, scalarDetails, severity)
-- Consumers must validate gameplay actions using their own authoritative state.
exports('ReportDetection', function(id, rule, details, severity)
    local state = stateFor(id)
    if not state or type(rule) ~= 'string' or #rule < 1 or #rule > 64
        or not rule:match('^[%w_.%-]+$') or type(details) ~= 'table' then return false end
    severity = severity or 'medium'
    if severity ~= 'info' and severity ~= 'low' and severity ~= 'medium' and severity ~= 'high' then return false end
    local evidence, count, bytes = {}, 0, 0
    for key, value in pairs(details) do
        count = count + 1
        if count > 12 or type(key) ~= 'string' or #key > 64
            or not utf8.len(key) or key:find('%z') then return false end
        if type(value) == 'string' then
            bytes = bytes + #key + #value
            if #value > 512 or bytes > 1400 or not utf8.len(value) or value:find('%z') then return false end
        elseif type(value) ~= 'boolean' and not R.finite(value) then
            return false
        end
        evidence[key] = value
    end
    return report(state, rule, severity, {
        trust = 'SERVER RESOURCE REPORT', action = 'report only',
        resource = text(GetInvokingResource(), 128), evidence = evidence
    }, 5000, 'consumer')
end)

local function roster()
    local result, present = {}, {}
    local now = GetGameTimer()
    for _, id in ipairs(GetPlayers()) do
        local state = stateFor(id)
        if state then
            present[state.id] = true
            state.name = text(GetPlayerName(state.id), 128)
            local position = positionOf(state.id)
            local ped = GetPlayerPed(state.id)
            result[#result + 1] = { id = state.id, name = state.name, sessionId = state.sessionId,
                ping = math.max(0, GetPlayerPing(state.id)), identifiers = state.identifiers,
                position = position or json.null, health = ped ~= 0 and GetEntityHealth(ped) or json.null,
                armor = ped ~= 0 and GetPedArmour(ped) or json.null,
                dashboardAdmin = AxiomDashboard and AxiomDashboard.allowed(state.id) == true or false }
            if position and state.position and enabled(state, 'movement_observation') then
                local seconds = R.elapsed(now, state.positionAt) / 1000
                if seconds > 0 then
                    local x, y, z = position.x - state.position.x, position.y - state.position.y, position.z - state.position.z
                    local speed = math.sqrt(x * x + y * y + z * z) / seconds
                    if speed > (protection.movementSpeed or 150) then
                        report(state, 'movement_observation', 'low', { trust = 'SERVER POSITION SAMPLE',
                            action = 'observation only; never enforced', speed = speed,
                            note = 'Teleports, vehicles and legitimate scripts can cause this observation.' }, 30000)
                    end
                end
            end
            state.position, state.positionAt = position, now
            if enabled(state, 'heartbeat_missing') and not state.missingReported and R.elapsed(now, state.lastObservation) >= config.heartbeatTimeout * 1000 then
                state.missingReported = enqueue('system', state, 'heartbeat_missing', 'low', {
                    trust = 'LOW TRUST: missing client observation', action = 'observation only; never enforced',
                    seconds = math.floor(R.elapsed(now, state.lastObservation) / 1000)
                })
            end
        end
    end
    for id in pairs(players) do if not present[id] then players[id] = nil end end
    return result
end

local function resources()
    local list = {}
    for i = 0, GetNumResources() - 1 do
        local name = GetResourceByFindIndex(i)
        if name then list[#list + 1] = { name = text(name, 128), state = GetResourceState(name) } end
        if #list >= 2048 then break end
    end
    return list
end

local function commandMatches(command)
    local state = players[command.playerId]
    return state and GetPlayerName(state.id) and state.sessionId == command.playerSession
        and licenseOf(identifiers(state.id)) == command.license and command.serverSession == session
end


local function capture(command)
    local finished = false
    local function finish(status, message)
        if finished then return end
        finished = true
        commandResult(command, status, message)
    end
    SetTimeout(25000, function() finish('failed', 'Screenshot callback timed out.') end)
    if GetResourceState('screenshot-basic') ~= 'started' then finish('failed', 'screenshot-basic is not running.'); return end
    local ok, err = pcall(function()
        exports['screenshot-basic']:requestClientScreenshot(command.playerId, { encoding = 'jpg', quality = 0.65 }, function(error, image)
            if finished then return end
            if error or not commandMatches(command) then finish('failed', 'Screenshot failed or player session changed.'); return end
            if type(image) ~= 'string' or #image > 8 * 1024 * 1024 - 1024
                or not image:match('^data:image/jpeg;base64,[%w+/=]+$') then finish('failed', 'Invalid or oversized JPEG.'); return end
            local payload = json.encode({ commandId = command.id, key = command.key, image = image })
            if #payload > 8 * 1024 * 1024 then finish('failed', 'Screenshot request exceeds 8 MiB.'); return end
            PerformHttpRequest(endpoint .. '/api/media', function(status)
                finish(status == 200 and 'completed' or 'failed', status == 200 and 'Screenshot received.' or ('Media HTTP ' .. tostring(status)))
            end, 'POST', payload, { ['Content-Type'] = 'application/json', ['Authorization'] = 'Bearer ' .. token }, { followLocation = false })
        end)
    end)
    if not ok then finish('failed', text(tostring(err), 512)) end
end

local function runCommands(commands)
    local stamp = os.date('!%Y-%m-%dT%H:%M:%S.000Z')
    for id, untilAt in pairs(executed) do if untilAt <= stamp then executed[id] = nil end end
    for index, command in ipairs(commands or {}) do
        if index > 32 then break end
        if type(command) == 'table' and type(command.id) == 'string' and type(command.expiresAt) == 'string'
            and type(command.key) == 'string' and command.key ~= ''
            and type(command.playerSession) == 'string' and type(command.serverSession) == 'string'
            and command.expiresAt > stamp and not executed[command.id]
            and #resultQueue + pendingResults < 128 then
            executed[command.id] = command.expiresAt
            pendingResults = pendingResults + 1
            if not commandMatches(command) then commandResult(command, 'failed', 'Player or server session changed.')
            elseif command.type == 'kick' then
                local reason = text(command.reason, 256)
                if reason == '' or reason ~= command.reason then commandResult(command, 'failed', 'Invalid native kick reason.')
                else
                    local prefix = command.test == true and '[AXIOM GUARD TEST] Simulated detection: ' or '[AXIOM GUARD] '
                    nativeKick(players[command.playerId], prefix .. reason, command)
                end
            elseif command.type == 'screenshot' then capture(command)
            elseif command.type == 'script' then
                local ok, result = AxiomScripts.apply(command.plan, command.playerId)
                commandResult(command, ok and 'completed' or 'failed', ok and 'Owner Lua script completed.' or tostring(result), ok and result or nil)
            elseif command.type == 'preset' then
                local ped = GetPlayerPed(command.playerId)
                local ok, data = pcall(function()
                    if ped == 0 then error('Player ped is unavailable.') end
                    if command.preset == 'disarm_player' then RemoveAllPedWeapons(ped, true)
                    elseif command.preset ~= 'inspect_player' then error('Unsupported native preset.') end
                    return { position = positionOf(command.playerId), health = GetEntityHealth(ped), armor = GetPedArmour(ped) }
                end)
                commandResult(command, ok and 'completed' or 'failed', ok and ('Native preset: ' .. command.preset) or tostring(data), ok and data or nil)
            else commandResult(command, 'failed', 'Unsupported native command.')
            end
        end
    end
end

local function arrayJson(values)
    return #values == 0 and '[]' or json.encode(values)
end

local function rosterJson(values)
    local rows = {}
    for _, player in ipairs(values) do
        local ids = player.identifiers
        player.identifiers = nil
        rows[#rows + 1] = json.encode(player):sub(1, -2) .. ',"identifiers":' .. arrayJson(ids) .. '}'
        player.identifiers = ids
    end
    return '[' .. table.concat(rows, ',') .. ']'
end

local banCursor = 1
local function ingest()
    local currentPlayers = roster()
    if inFlight then return end -- At most one outstanding HTTP request, even during outages.
    if token == '' then lastTransport = 'dashboard disabled; Lua backend active'; return end
    local requestedAt = GetGameTimer()
    local banRows = {}
    local localBans = B.banState.localBans
    for _ = 1, math.min(8, #localBans) do
        if banCursor > #localBans then banCursor = 1 end
        banRows[#banRows + 1] = localBans[banCursor]
        banCursor = banCursor + 1
    end
    local header = json.encode({ name = serverName, mode = effectiveMode(requestedAt), sessionId = session,
        uptime = math.floor(R.elapsed(requestedAt, startedAt) / 1000),
        capabilities = { screenshots = GetResourceState('screenshot-basic') == 'started', presets = true, kick = true, scripts = true, luaBackend = true },
        resourceVersion = '1.7.1' }):sub(1, -2) .. ',"players":' .. rosterJson(currentPlayers)
        .. ',"resources":' .. arrayJson(resources()) .. ',"luaBans":' .. arrayJson(banRows) .. '}'
    local sentResults, remainingResults = {}, {}
    for i, result in ipairs(resultQueue) do
        local destination = i <= 32 and sentResults or remainingResults
        destination[#destination + 1] = result
    end
    local encodedResults = arrayJson(sentResults)
    local overhead = #header + #encodedResults + 40
    local encoded, batch, size = {}, {}, overhead
    for i = 1, math.min(#queue, BATCH_SIZE) do
        local event = json.encode(queue[i])
        if size + #event + 1 > 512 * 1024 then break end
        size = size + #event + 1
        encoded[#encoded + 1], batch[#batch + 1] = event, queue[i]
    end
    if overhead > 512 * 1024 or (#batch == 0 and #queue > 0) then
        lastTransport = 'dashboard payload exceeds ingest size limit'; return
    end
    local pending = {}
    for i = #batch + 1, #queue do pending[#pending + 1] = queue[i] end
    queue, inFlight, resultQueue = pending, batch, remainingResults
    local payload = '{"server":' .. header .. ',"results":' .. encodedResults .. ',"events":[' .. table.concat(encoded, ',') .. ']}'
    local function complete(status, body)
        if inFlight ~= batch then return end
        local decoded, response = pcall(json.decode, body or '')
        local nextConfig = decoded and type(response) == 'table' and R.config(response.config)
        if status == 200 and nextConfig and type(response.protection) == 'table'
            and type(response.protection.rules) == 'table' and type(response.bans) == 'table' then
            local ok, err = B.acceptDashboard(response)
            if ok then refreshLocal() end
            lastTransport = ok and 'ok' or ('dashboard config rejected: ' .. text(tostring(err), 128))
            runCommands(response.commands)
        else
            -- Reserve in-flight capacity, restore original keys/order; backend dedups retries.
            for _, event in ipairs(queue) do batch[#batch + 1] = event end
            queue = batch
            for _, result in ipairs(resultQueue) do sentResults[#sentResults + 1] = result end
            resultQueue = sentResults
            lastTransport = 'HTTP ' .. tostring(status) .. (status == 200 and ' invalid config' or '')
        end
        for _, state in pairs(players) do sendClientPolicy(state, false) end
        inFlight = false
    end
    local ok = pcall(PerformHttpRequest, endpoint .. '/api/ingest', complete, 'POST', payload,
        { ['Content-Type'] = 'application/json', ['Authorization'] = 'Bearer ' .. token },
        { followLocation = false })
    if not ok then complete(0, '') end
end

local function reply(id, message)
    local line = '[axiom_guard] ' .. message
    if id == 0 then print(line) else TriggerClientEvent('axiom_guard:commandResult', id, line) end
end

RegisterCommand('guard_status', function(id)
    local now = GetGameTimer()
    reply(id, json.encode({ mode = effectiveMode(now), configuredMode = config.mode,
        configAgeSeconds = configAt and math.floor(R.elapsed(now, configAt) / 1000) or json.null,
        transport = lastTransport, queued = #queue, inFlight = inFlight and #inFlight or 0,
        queueLimit = MAX_QUEUE, dropped = dropped, suppressed = suppressed,
        players = #GetPlayers(), resourceVersion = '1.7.1', fullConfigRevision = fullRevision, limits = config,
        clientTrust = 'CLIENT REPORT; sender-bound opt-in punishment; local mitigation requires fresh protect policy', actions = 'fresh protect: configured mitigation/cancel/kick/durable-ban; manual confirmed native commands also allowed in monitor'
    }))
end, true)

RegisterCommand('guard_selfcheck', function(id)
    if id ~= 0 then reply(id, 'Selfcheck is console-only.'); return end
    local ok, result = pcall(AxiomSelfcheck)
    reply(id, ok and result or ('FAIL: ' .. tostring(result)))
end, true)

CreateThread(function()
    while true do
        refreshLocal()
        for _, state in pairs(players) do sendClientPolicy(state, false) end
        ingest()
        Wait(5000)
    end
end)
