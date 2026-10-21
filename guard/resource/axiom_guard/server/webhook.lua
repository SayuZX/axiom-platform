-- Server-only Discord outbox. Load after server/storage.lua; never replicate this store.
local B = assert(AxiomBackend, 'AXIOM webhook requires server/storage.lua')
local W = {}
AxiomWebhook = W
local MAX_QUEUE, MAX_SEEN, MAX_ATTEMPTS, MAX_HOOKS = 500, 2048, 6, 64
local REQUEST_TIMEOUT, MAX_RETRY_DELAY = 30000, 900
local CATEGORIES = { 'connection', 'disconnection', 'detection', 'system' }
local CATEGORY = { connection = true, disconnection = true, detection = true, system = true }
local COUNTERS = { 'accepted', 'delivered', 'duplicates', 'filtered', 'disabled', 'overflow', 'invalid', 'attempts', 'retries', 'failed', 'cancelled', 'timeouts', 'storageErrors', 'recoveredInvalid' }
local function integer(value, maximum)
    return type(value) == 'number' and value >= 0 and value <= maximum and value % 1 == 0
end
local function copy(value)
    local result = {}
    for key, field in pairs(value) do result[key] = field end
    return result
end
local function endpoint(value)
    if value == '' then return true end
    if type(value) ~= 'string' or #value > 280 then return false end
    local id, token = value:match('^https://discord%.com/api/webhooks/([0-9]+)/([A-Za-z0-9_%-]+)$')
    return id ~= nil and #id >= 10 and #id <= 30 and #token >= 20 and #token <= 200
end
local function categories(value)
    if type(value) ~= 'table' then return nil end
    local result, count = {}, 0
    for key, enabled in pairs(value) do
        count = count + 1
        if count > 4 then return nil end
        if type(key) == 'number' and integer(key, 4) and key > 0 and CATEGORY[enabled] then result[enabled] = true
        elseif CATEGORY[key] and type(enabled) == 'boolean' then result[key] = enabled
        else return nil end
    end
    for _, key in ipairs(CATEGORIES) do result[key] = result[key] == true end
    return result
end
local function sensitive(key)
    key = key:lower():gsub('[^a-z0-9]', '')
    return key == 'ip' or key == 'ipv4' or key == 'ipv6' or key == 'steam' or key == 'discord'
        or key == 'license' or key == 'license2' or key == 'fivem' or key == 'xbl' or key == 'live'
        or key:find('token', 1, true) or key:find('secret', 1, true) or key:find('password', 1, true)
        or key:find('authorization', 1, true) or key:find('cookie', 1, true) or key:find('credential', 1, true)
        or key:find('webhook', 1, true) or key:find('identifier', 1, true) or key:find('address', 1, true)
        or key:find('apikey', 1, true) or key:find('endpoint', 1, true) or key == 'url'
end
local function truncate(value, limit)
    if #value <= limit then return value end
    while limit > 0 do
        local byte = value:byte(limit + 1)
        if not byte or byte < 128 or byte >= 192 then break end
        limit = limit - 1
    end
    return value:sub(1, limit)
end
local function text(value, limit)
    if type(value) == 'number' then
        if value ~= value or value == math.huge or value == -math.huge then return '' end
        value = tostring(value)
    elseif type(value) == 'boolean' then value = tostring(value)
    elseif type(value) ~= 'string' then return '' end
    value = truncate(value, 4096)
    if not utf8.len(value) then return '[INVALID UTF-8]' end
    value = value:gsub('[%z\1-\31\127]', ' '):gsub('[`*<>|]', '')
        :gsub('[Hh][Tt][Tt][Pp][Ss]?://[^%s]+', '[URL REDACTED]')
        :gsub('[Bb][Ee][Aa][Rr][Ee][Rr]%s+[^%s,;]+', 'Bearer [REDACTED]')
        :gsub('([%a_%-]+)(%s*[:=]%s*)([^%s,;]+)', function(key, separator, data)
            return sensitive(key) and (key .. separator .. '[REDACTED]') or (key .. separator .. data)
        end)
        :gsub('[0-9]+%.[0-9]+%.[0-9]+%.[0-9]+', '[IP REDACTED]')
        :gsub('[0-9A-Fa-f:]+', function(part)
            local _, colons = part:gsub(':', '')
            return (colons >= 3 or part:find('::', 1, true)) and '[IP REDACTED]' or part
        end)
        :gsub('@', '(at)')
    return truncate(value, limit)
end
local function detailText(details)
    local lines, inspected = {}, 0
    local function visit(value, prefix, depth)
        for key, field in pairs(value) do
            inspected = inspected + 1
            if inspected > 32 or #lines >= 12 then return end
            if type(key) == 'string' or type(key) == 'number' then
                local name = text(key, 64)
                local path = prefix == '' and name or prefix .. '.' .. name
                if depth ~= 0 or (key ~= 'trust' and key ~= 'action' and key ~= 'playerSession' and key ~= 'serverSession') then
                    if sensitive(name) then lines[#lines + 1] = path .. ': [REDACTED]'
                    elseif type(field) == 'table' and depth < 2 then visit(field, path, depth + 1)
                    elseif type(field) ~= 'table' then
                        local clean = text(field, 180)
                        if clean ~= '' then lines[#lines + 1] = path .. ': ' .. clean end
                    end
                end
            end
        end
    end
    visit(details, '', 0)
    return truncate(table.concat(lines, '\n'), 1024)
end
local function identity(value, limit)
    return type(value) == 'string' and #value > 0 and #value <= limit and value:match('^[A-Za-z0-9_:%.%-]+$') ~= nil
end
local function record(server, event)
    if type(server) ~= 'table' or type(event) ~= 'table' or not CATEGORY[event.kind] or not identity(event.key, 200) then return nil end
    local details = type(event.details) == 'table' and event.details or {}
    local session = server.sessionId or details.serverSession
    if not identity(session, 128) then return nil end
    local at = event.at
    if type(at) ~= 'string' or not at:match('^%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%dZ$') then at = os.date('!%Y-%m-%dT%H:%M:%SZ') end
    return { key = session .. '|' .. event.key, eventKey = event.key, kind = event.kind, at = at,
        server = text(server.name, 120), serverSession = session, playerSession = text(details.playerSession, 128),
        playerId = integer(event.playerId, 65535) and tostring(event.playerId) or '-', player = text(event.playerName, 96),
        rule = text(event.rule, 128), action = text(details.action, 128), trust = text(details.trust, 160), details = detailText(details) }
end
local function restoreRecord(value)
    if type(value) ~= 'table' or not CATEGORY[value.kind] or not identity(value.eventKey, 200)
        or not identity(value.serverSession, 128) or value.key ~= value.serverSession .. '|' .. value.eventKey then return nil end
    local restored = record({ name = value.server, sessionId = value.serverSession }, {
        key = value.eventKey, kind = value.kind, at = value.at, rule = value.rule, playerId = tonumber(value.playerId), playerName = value.player,
        details = { action = value.action, trust = value.trust, playerSession = value.playerSession }
    })
    restored.details = text(value.details, 1024)
    return restored
end
local state = { version = 2, destinations = {}, queue = {}, seen = {}, counters = {}, sequence = 0, revision = 0 }
local dirty, storageError, lastError, nextPersist = false, nil, nil, 0
local queued, seen, inFlight = {}, {}, nil
local function count(key) state.counters[key] = (state.counters[key] or 0) + 1; dirty = true end
local function remember(target, index, key)
    if index[key] then return end
    if #target.seen >= MAX_SEEN then index[table.remove(target.seen, 1)] = nil end
    target.seen[#target.seen + 1], index[key] = key, true
end
local function reindex()
    queued, seen = {}, {}
    for _, item in ipairs(state.queue) do queued[item.key] = item end
    for _, key in ipairs(state.seen) do seen[key] = true end
end
local function hookKey(id)
    if integer(id, 9007199254740991) and id > 0 then return 'dashboard:' .. ('%.0f'):format(id) end
end
local loaded = B.loadStore('webhook', {})
if type(loaded) == 'table' and loaded.version == 2 then
    state.sequence = integer(loaded.sequence, 9007199254740000) and loaded.sequence or 0
    state.revision = integer(loaded.revision, 9007199254740000) and loaded.revision or 0
    for _, key in ipairs(COUNTERS) do
        local value = type(loaded.counters) == 'table' and loaded.counters[key]
        state.counters[key] = integer(value, 9007199254740000) and value or 0
    end
    if type(loaded.destinations) == 'table' then
        local countHooks = 0
        for key, hook in pairs(loaded.destinations) do
            local kinds = type(hook) == 'table' and categories(hook.kinds)
            if kinds and endpoint(hook.url) and type(hook.enabled) == 'boolean' and integer(hook.version, 9007199254740000)
                and (key == 'local' or key == hookKey(hook.id)) and countHooks < MAX_HOOKS + 1 then
                state.destinations[key] = { id = key == 'local' and 'local' or hook.id, name = text(hook.name, 80), url = hook.url,
                    kinds = kinds, enabled = hook.enabled and hook.url ~= '', version = hook.version,
                    nextRequest = integer(hook.nextRequest, os.time() + MAX_RETRY_DELAY) and hook.nextRequest or 0, paused = hook.paused == true }
                countHooks = countHooks + 1
                state.revision = math.max(state.revision, hook.version)
            else count('recoveredInvalid') end
        end
    end
    if type(loaded.queue) == 'table' then
        for _, item in ipairs(loaded.queue) do
            local saved = type(item) == 'table' and restoreRecord(item.record)
            local hook = saved and state.destinations[item.destination]
            local key = hook and (item.destination .. '|' .. saved.key)
            if hook and hook.enabled and hook.version == item.version and hook.kinds[saved.kind]
                and #state.queue < MAX_QUEUE and not queued[key] then
                state.sequence = state.sequence + 1
                local attempts = integer(item.attempts, MAX_ATTEMPTS) and item.attempts or MAX_ATTEMPTS
                local pending = { id = state.sequence, key = key, destination = item.destination, version = item.version, record = saved,
                    attempts = attempts, nextAt = integer(item.nextAt, os.time() + MAX_RETRY_DELAY) and item.nextAt or os.time(),
                    failed = item.failed == true or attempts >= MAX_ATTEMPTS }
                state.queue[#state.queue + 1], queued[key] = pending, pending
            else count('recoveredInvalid') end
        end
    end
    if type(loaded.seen) == 'table' then
        for _, key in ipairs(loaded.seen) do
            if type(key) == 'string' and #key <= 370 and not seen[key] and #state.seen < MAX_SEEN then
                state.seen[#state.seen + 1], seen[key] = key, true
            end
        end
    end
    dirty = true
end
for _, key in ipairs(COUNTERS) do state.counters[key] = state.counters[key] or 0 end
state.destinations['local'] = state.destinations['local'] or { id = 'local', name = 'Local console', url = '', kinds = categories(CATEGORY), enabled = false, version = 0, nextRequest = 0, paused = false }
local function save(value)
    local called, ok = pcall(B.saveStore, 'webhook', value)
    if called and ok == true then dirty, storageError, nextPersist = false, nil, 0; return true end
    count('storageErrors')
    storageError, nextPersist = 'outbox persistence failed; delivery paused', os.time() + 5
    return false
end
local function persist(force)
    if not dirty then return true end
    if not force and os.time() < nextPersist then return false end
    return save(state)
end
local function sameHook(a, b)
    if not a or a.url ~= b.url or a.enabled ~= b.enabled or a.name ~= b.name then return false end
    for _, key in ipairs(CATEGORIES) do if a.kinds[key] ~= b.kinds[key] then return false end end
    return true
end
local function configureSet(destinations)
    local changed, revision = false, state.revision
    for key, hook in pairs(destinations) do
        if sameHook(state.destinations[key], hook) then destinations[key] = state.destinations[key]
        else
            changed, revision = true, revision + 1
            hook.version, hook.nextRequest, hook.paused = revision, 0, false
        end
    end
    for key in pairs(state.destinations) do if not destinations[key] then changed = true end end
    if not changed then return true end
    local candidate, remembered = copy(state), copy(seen)
    candidate.destinations, candidate.revision, candidate.queue = destinations, revision, {}
    candidate.counters, candidate.seen = copy(state.counters), copy(state.seen)
    for _, item in ipairs(state.queue) do
        local hook = destinations[item.destination]
        if hook and hook.enabled and hook.version == item.version and hook.kinds[item.record.kind] then
            candidate.queue[#candidate.queue + 1] = item
        else
            candidate.counters.cancelled = candidate.counters.cancelled + 1
            remember(candidate, remembered, item.key)
        end
    end
    if not save(candidate) then return nil, 'configuration not saved; previous configuration retained' end
    state = candidate
    reindex()
    lastError = nil
    return true
end
function W.configure(url, kinds)
    if not endpoint(url) then return nil, 'expected https://discord.com/api/webhooks/<id>/<token>, without query or fragment' end
    local selected = kinds == nil and state.destinations['local'].kinds or categories(kinds)
    if not selected then return nil, 'categories must be connection, disconnection, detection, system' end
    local destinations = copy(state.destinations)
    destinations['local'] = { id = 'local', name = 'Local console', url = url, kinds = selected, enabled = url ~= '' }
    return configureSet(destinations)
end
function W.configureMany(hooks)
    if type(hooks) ~= 'table' or #hooks > MAX_HOOKS then return nil, 'expected at most 64 dashboard webhooks' end
    local destinations, length = { ['local'] = state.destinations['local'] }, #hooks
    for index, hook in pairs(hooks) do
        if not integer(index, length) or index == 0 or type(hook) ~= 'table' then return nil, 'invalid webhook list' end
        local key, kinds = hookKey(hook.id), categories(hook.eventKinds)
        if not key or destinations[key] or not kinds or type(hook.enabled) ~= 'boolean' or not endpoint(hook.url) or hook.url == ''
            or type(hook.name) ~= 'string' or #hook.name > 320 then return nil, 'invalid dashboard webhook configuration' end
        destinations[key] = { id = hook.id, name = text(hook.name, 80), url = hook.url, kinds = kinds, enabled = hook.enabled }
    end
    return configureSet(destinations)
end
function W.enqueue(server, event)
    local entry = record(server, event)
    if not entry then count('invalid'); return false, 'invalid event identity or category' end
    local added, active, selected, overflow = 0, false, false, false
    for destination, hook in pairs(state.destinations) do
        if hook.enabled then
            active = true
            if hook.kinds[entry.kind] then
                selected = true
                local key = destination .. '|' .. entry.key
                if queued[key] or seen[key] then count('duplicates')
                elseif #state.queue >= MAX_QUEUE then count('overflow'); overflow = true
                else
                    state.sequence = state.sequence + 1
                    local item = { id = state.sequence, key = key, destination = destination, version = hook.version,
                        record = entry, attempts = 0, nextAt = os.time(), failed = false }
                    state.queue[#state.queue + 1], queued[key] = item, item
                    count('accepted')
                    added = added + 1
                end
            end
        end
    end
    if not active then count('disabled'); return false, 'webhook disabled' end
    if not selected then count('filtered'); return false, 'category disabled' end
    if added > 0 and not persist(false) then return false, 'queued in memory; durable storage unavailable' end
    if overflow then return false, 'outbox full; some destinations rejected' end
    return added > 0, added == 0 and 'duplicate event' or nil
end
function W.status()
    local result = { configured = false, queued = #state.queue, maxQueue = MAX_QUEUE, failed = 0, inFlight = inFlight ~= nil,
        maxAttempts = MAX_ATTEMPTS, dirty = dirty, storageError = storageError, lastError = lastError, counters = {}, destinations = {} }
    for _, key in ipairs(COUNTERS) do result.counters[key] = state.counters[key] end
    for key, hook in pairs(state.destinations) do
        result.destinations[#result.destinations + 1] = { id = hook.id, source = key == 'local' and 'local' or 'dashboard',
            enabled = hook.enabled, version = hook.version, kinds = copy(hook.kinds), paused = hook.paused, nextRequestAt = hook.nextRequest }
        result.configured = result.configured or hook.enabled
    end
    for _, item in ipairs(state.queue) do if item.failed then result.failed = result.failed + 1 end end
    return result
end
local function payload(entry)
    local function field(name, value) return { name = name, value = value ~= '' and value or '-', inline = false } end
    local embed = { title = 'AXIOM Guard: ' .. entry.kind, timestamp = entry.at,
        description = entry.details ~= '' and entry.details or 'No additional details.',
        fields = { field('Server', entry.server), field('Player', entry.player .. ' (ID ' .. entry.playerId .. ')'),
            field('Rule', entry.rule), field('Action', entry.action), field('Trust', entry.trust),
            field('Player session', entry.playerSession), field('Server session', text(entry.serverSession, 128)) }, footer = { text = 'Event: ' .. text(entry.eventKey, 200) } }
    -- Literal [] avoids Lua JSON encoders treating an empty table as an object.
    return '{"allowed_mentions":{"parse":[]},"embeds":[' .. json.encode(embed) .. ']}'
end
local function retryDelay(body, headers, attempts)
    local value
    if type(body) == 'string' and #body <= 16384 then
        local ok, data = pcall(json.decode, body)
        if ok and type(data) == 'table' and (type(data.retry_after) == 'number' or type(data.retry_after) == 'string') then value = tonumber(data.retry_after) end
    end
    if not value and type(headers) == 'table' then
        for key, header in pairs(headers) do
            if type(key) == 'string' and (key:lower() == 'retry-after' or key:lower() == 'x-ratelimit-reset-after')
                and (type(header) == 'string' or type(header) == 'number') then value = tonumber(header); break end
        end
    end
    if value and (value ~= value or value < 0 or value > MAX_RETRY_DELAY) then return nil end
    return math.max(1, math.ceil(value or math.min(120, 2 ^ attempts)))
end
local function complete(request, status, body, headers, failure)
    if AxiomWebhook ~= W or inFlight ~= request then return end
    inFlight = nil
    local item, hook = request.item, state.destinations[request.item.destination]
    if queued[request.key] ~= item or item.id ~= request.id or item.attempts ~= request.attempt
        or not hook or not hook.enabled or hook.version ~= request.version then return end
    if status == 200 or status == 204 then
        queued[request.key] = nil
        for index, pending in ipairs(state.queue) do if pending == item then table.remove(state.queue, index); break end end
        remember(state, seen, request.key)
        count('delivered')
        lastError = nil
    else
        local retry = status == 429 or (integer(status, 599) and status >= 500) or status == 0 or status == -1
        local delay = math.min(120, 2 ^ item.attempts)
        if status == 429 then
            delay = retryDelay(body, headers, item.attempts)
            -- Excessive retry_after pauses this destination; never retry sooner than Discord requested.
            if delay then hook.nextRequest = os.time() + delay else hook.paused = true end
        end
        if retry and delay and item.attempts < MAX_ATTEMPTS then item.nextAt = os.time() + delay; count('retries')
        else item.failed = true; count('failed') end
        lastError = failure or (integer(status, 599) and ('Discord HTTP ' .. status) or 'invalid HTTP callback')
    end
    dirty, hook.nextRequest = true, math.max(hook.nextRequest, os.time() + 1)
    persist(false)
end
local function dispatch(item, hook)
    local ok, body = pcall(payload, item.record)
    if not ok then item.failed = true; count('failed'); lastError = 'payload encoding failed'; persist(false); return end
    item.attempts, item.nextAt = item.attempts + 1, os.time() + math.ceil(REQUEST_TIMEOUT / 1000)
    count('attempts')
    if not persist(false) then
        item.attempts, state.counters.attempts, dirty = item.attempts - 1, state.counters.attempts - 1, true
        return
    end
    local request = { item = item, id = item.id, key = item.key, version = item.version, attempt = item.attempts, startedAt = GetGameTimer() }
    inFlight = request
    local called = pcall(PerformHttpRequest, hook.url .. '?wait=true', function(status, response, headers)
        if type(status) ~= 'number' or status % 1 ~= 0 or (status ~= -1 and not integer(status, 599)) then
            complete(request, nil, nil, nil, 'invalid HTTP callback'); return
        end
        complete(request, status, response, headers)
    end, 'POST', body, { ['Content-Type'] = 'application/json' }, { followLocation = false })
    if not called then complete(request, 0, nil, nil, 'HTTP native failed') end
end
local configured = GetConvar('axiom_guard_webhook', '')
local pendingConvar, convarRetryAt
if configured ~= '' then
    pendingConvar = endpoint(configured) and configured or ''
    if not endpoint(configured) then lastError = 'invalid webhook convar; local destination disabled' end
    if W.configure(pendingConvar) then pendingConvar = nil else convarRetryAt = os.time() + 5 end
end
RegisterCommand('guard_webhook', function(source, args)
    if source ~= 0 or GetInvokingResource() ~= nil then return end
    local operation = args[1] or 'status'
    if operation == 'status' then print('[AXIOM webhook] ' .. json.encode(W.status())); return end
    local selected
    if args[3] or operation == 'categories' then
        local input = operation == 'categories' and args[2] or args[3]
        selected = {}
        if input == 'all' then selected = CATEGORY
        elseif input == 'none' then selected = {}
        elseif type(input) == 'string' and input ~= '' and not input:find(',,', 1, true) and input:sub(1, 1) ~= ',' and input:sub(-1) ~= ',' then
            for kind in input:gmatch('[^,]+') do
                if not CATEGORY[kind] then print('[AXIOM webhook] Invalid category.'); return end
                selected[kind] = true
            end
        else print('[AXIOM webhook] Invalid category list.'); return end
    end
    local ok, err
    if operation == 'set' and #args <= 3 then ok, err = W.configure(args[2], selected)
    elseif operation == 'off' and #args == 1 then ok, err = W.configure('')
    elseif operation == 'categories' and #args == 2 then ok, err = W.configure(state.destinations['local'].url, selected)
    elseif operation == 'retry' and #args == 1 then
        if inFlight then print('[AXIOM webhook] Wait for current request before retrying failed entries.'); return end
        for _, hook in pairs(state.destinations) do hook.paused = false end
        for _, item in ipairs(state.queue) do if item.failed then item.failed, item.attempts, item.nextAt = false, 0, os.time() end end
        dirty = true
        ok = persist(true)
        if not ok then err = 'outbox persistence failed; delivery paused' end
    else
        print('[AXIOM webhook] guard_webhook status | set <URL> [all|none|connection,disconnection,detection,system] | categories <list> | off | retry')
        return
    end
    if ok and (operation == 'set' or operation == 'off' or operation == 'categories') then pendingConvar = nil end
    print(ok and '[AXIOM webhook] Configuration saved.' or ('[AXIOM webhook] ' .. err))
end, true)
CreateThread(function()
    while AxiomWebhook == W do
        Wait(500)
        if AxiomWebhook ~= W then return end
        local now = os.time()
        if pendingConvar ~= nil and now >= convarRetryAt then
            if W.configure(pendingConvar) then pendingConvar = nil else convarRetryAt = now + 5 end
        end
        persist(false)
        if inFlight and ((GetGameTimer() - inFlight.startedAt) & 0xffffffff) >= REQUEST_TIMEOUT then
            count('timeouts')
            complete(inFlight, 0, nil, nil, 'HTTP callback timeout')
        end
        if not inFlight and not dirty and not storageError then
            for _, item in ipairs(state.queue) do
                local hook = state.destinations[item.destination]
                if hook and hook.enabled and hook.version == item.version and not hook.paused and now >= hook.nextRequest
                    and (item.destination ~= 'local' or pendingConvar == nil)
                    and not item.failed and item.nextAt <= now then dispatch(item, hook); break end
            end
        end
    end
end)
