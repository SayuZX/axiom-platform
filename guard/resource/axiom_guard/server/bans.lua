local B = AxiomBackend

function B.strongIdentifiers(values)
    local result, seen = {}, {}
    for _, value in ipairs(type(values) == 'table' and values or {}) do
        if B.text(value, 160) then
            value = value:lower()
            local kind, payload = value:match('^([a-z0-9]+):(.+)$')
            local valid = (kind == 'license' or kind == 'license2' or kind == 'steam') and payload:match('^[a-f0-9]+$')
                or (kind == 'fivem' or kind == 'discord' or kind == 'xbl' or kind == 'live') and payload:match('^%d+$')
            if valid and not seen[value] then seen[value] = true; result[#result + 1] = value end
        end
    end
    return result
end

function B.primary(ids)
    for _, kind in ipairs({ 'license:', 'license2:' }) do
        for _, id in ipairs(ids or {}) do if id:sub(1, #kind) == kind then return id:sub(#kind + 1), id end end
    end
end

function B.ipv4(address)
    if type(address) ~= 'string' then return nil end
    local a, b, c, d = address:match('^(%d+)%.(%d+)%.(%d+)%.(%d+)$')
    if not a then return nil end
    local result = 0
    for _, part in ipairs({ a, b, c, d }) do
        if #part > 3 or (#part > 1 and part:sub(1, 1) == '0') or tonumber(part) > 255 then return nil end
        result = result * 256 + tonumber(part)
    end
    return result
end

function B.addresses(ids)
    local addresses, seen = {}, {}
    for _, id in ipairs(ids or {}) do
        local address = type(id) == 'string' and id:match('^ip:(.+)$')
        if address and B.ipv4(address) and not seen[address] then seen[address] = true; addresses[#addresses + 1] = address end
    end
    return addresses
end

function B.active(record, now)
    return not record.revokedAt and not record.removedAt and (record.expiresAt == nil or (B.epoch(record.expiresAt) or 0) > (now or os.time()))
end

local function cleanBan(value, origin, prior)
    if type(value) ~= 'table' or (type(value.id) ~= 'string' and type(value.id) ~= 'number') or not B.text(tostring(value.id), 100)
        or not B.text(value.uid, 160) or not B.text(value.reason or '', 2048) or not B.array(value.identifiers, 256) then return nil, 'Invalid ban record' end
    local ids = B.strongIdentifiers(value.identifiers)
    if #ids == 0 then return nil, 'Ban requires native identifiers' end
    if value.expiresAt ~= nil and value.expiresAt ~= json.null and (type(value.expiresAt) ~= 'string' or not B.epoch(value.expiresAt)) then return nil, 'Invalid ban expiry' end
    local addresses = {}
    for _, address in ipairs(type(value.addresses) == 'table' and value.addresses or {}) do
        if B.ipv4(address) then addresses[#addresses + 1] = address end
        if #addresses == 64 then break end
    end
    return { id = value.id, uid = value.uid, reason = value.reason or '', identifiers = ids, addresses = addresses,
        createdAt = B.epoch(value.createdAt) and value.createdAt or prior and prior.createdAt or B.stamp(),
        expiresAt = value.expiresAt ~= json.null and value.expiresAt or nil,
        origin = origin, actor = B.text(value.actor, 128) and value.actor or origin }
end

local function cleanWhitelist(value)
    if not B.array(value, 100000) then return nil, 'Invalid whitelist' end
    local result = {}
    for _, entry in ipairs(value) do
        if type(entry) ~= 'table' or not B.text(entry.uid, 160)
            or (entry.expiresAt ~= nil and entry.expiresAt ~= json.null and (type(entry.expiresAt) ~= 'string' or not B.epoch(entry.expiresAt))) then return nil, 'Invalid whitelist entry' end
        result[#result + 1] = { uid = entry.uid, expiresAt = entry.expiresAt ~= json.null and entry.expiresAt or nil }
    end
    return result
end

local store, found, corrupt = B.loadStore('bans', { localBans = {}, dashboardBans = {}, localWhitelist = {}, dashboardWhitelist = {}, revokedDashboard = {}, nextId = 1 })
store.localBans, store.dashboardBans = store.localBans or {}, store.dashboardBans or {}
store.localWhitelist, store.dashboardWhitelist = store.localWhitelist or {}, store.dashboardWhitelist or {}
store.revokedDashboard, store.nextId = store.revokedDashboard or {}, store.nextId or 1
B.banState = store

local function commit(nextStore)
    local ok, err = B.saveStore('bans', nextStore)
    if not ok then return nil, err end
    store, B.banState = nextStore, nextStore
    return true
end

-- The dashboard owns dashboard-origin records. Lua bans survive set replacement;
-- only explicit luaRevocations revoke them. Local dashboard-unban tombstones persist.
function B.acceptBans(policy)
    if type(policy) ~= 'table' or not B.array(policy.bans, 100000) then return nil, 'Invalid dashboard ban policy' end
    local whitelist, err = cleanWhitelist(policy.whitelist)
    if not whitelist then return nil, err end
    local nextStore, prior = B.copy(store), {}
    local revocations = policy.luaRevocations or {}
    if not B.array(revocations, 10000) then return nil, 'Invalid Lua revocations' end
    local revoked = {}
    for _, id in ipairs(revocations) do
        if not B.text(id, 100) or not id:match('^lua%-%d+$') then return nil, 'Invalid Lua ban id' end
        revoked[id] = true
    end
    for _, ban in ipairs(nextStore.localBans) do
        if revoked[ban.id] and not ban.revokedAt then ban.revokedAt = B.stamp() end
    end
    for _, ban in ipairs(store.dashboardBans) do prior[tostring(ban.id)] = ban end
    nextStore.dashboardBans, nextStore.dashboardWhitelist = {}, whitelist
    for _, value in ipairs(policy.bans) do
        if type(value) ~= 'table' then return nil, 'Invalid ban record' end
        local ban, problem = cleanBan(value, 'dashboard', prior[tostring(value.id)])
        if not ban then return nil, problem end
        nextStore.dashboardBans[#nextStore.dashboardBans + 1] = ban
    end
    if B.equal(nextStore, store) then return true end
    return commit(nextStore)
end

if not found and not corrupt then
    local seed = B.bootstrap().bans
    if type(seed) == 'table' then
        local ok, err = B.acceptBans(seed)
        if not ok then print('[AXIOM BACKEND] Ban bootstrap: ' .. tostring(err)) end
    else B.saveStore('bans', store) end
end

function B.banSnapshot()
    local result, now = { bans = {}, whitelist = {} }, os.time()
    for _, bans in ipairs({ store.localBans, store.dashboardBans }) do
        for _, ban in ipairs(bans) do
            if B.active(ban, now) and not (ban.origin == 'dashboard' and store.revokedDashboard[tostring(ban.id)]) then result.bans[#result.bans + 1] = B.copy(ban) end
        end
    end
    for _, entries in ipairs({ store.localWhitelist, store.dashboardWhitelist }) do
        for _, entry in ipairs(entries) do if B.active(entry, now) then result.whitelist[#result.whitelist + 1] = B.copy(entry) end end
    end
    return result
end

function B.matchBan(ids)
    return AxiomRules.localBan(B.banSnapshot(), ids, B.stamp())
end

function B.ban(state, rule, evidence)
    if type(state) ~= 'table' or not B.text(rule, 256) or type(evidence) ~= 'table' then return nil, 'Invalid ban evidence' end
    local ids = B.strongIdentifiers(state.identifiers)
    local uid = B.primary(ids)
    if not uid then return nil, 'No durable license identity; ban not created' end
    local existing = B.matchBan(ids)
    if existing then return existing.id end
    local encoded, body = pcall(json.encode, evidence)
    if not encoded or #body > 32768 then return nil, 'Ban evidence exceeds 32 KiB or is invalid' end
    local nextStore = B.copy(store)
    local id = 'lua-' .. tostring(nextStore.nextId)
    nextStore.nextId = nextStore.nextId + 1
    local addresses = B.addresses(state.identifiers)
    local known = B.history and B.history.identities and B.history.identities[uid]
    local seen = {}
    for _, address in ipairs(addresses) do seen[address] = true end
    for _, address in ipairs(known and known.addresses or {}) do if not seen[address] then addresses[#addresses + 1] = address; seen[address] = true end end
    nextStore.localBans[#nextStore.localBans + 1] = { id = id, uid = uid, identifiers = ids, addresses = addresses,
        name = B.text(state.name, 128) and state.name or '', reason = rule, createdAt = B.stamp(), origin = 'lua', actor = 'native enforcement', evidence = B.copy(evidence) }
    local ok, err = commit(nextStore)
    if not ok then return nil, err end
    return id
end

function B.unban(id)
    id = tostring(id)
    local nextStore, matched = B.copy(store), false
    for _, ban in ipairs(nextStore.localBans) do
        if tostring(ban.id) == id and B.active(ban) then ban.revokedAt = B.stamp(); matched = true end
    end
    for _, ban in ipairs(nextStore.dashboardBans) do
        if tostring(ban.id) == id and B.active(ban) and not nextStore.revokedDashboard[id] then
            nextStore.revokedDashboard[id] = B.stamp(); matched = true
        end
    end
    if not matched then return nil, 'Active ban not found' end
    return commit(nextStore)
end

function B.whitelist(uid, remove)
    if not B.text(uid, 160) or uid == '' then return nil, 'Identity uid required' end
    local nextStore, entries = B.copy(store), {}
    for _, entry in ipairs(nextStore.localWhitelist) do if entry.uid ~= uid then entries[#entries + 1] = entry end end
    if not remove then entries[#entries + 1] = { uid = uid } end
    nextStore.localWhitelist = entries
    if B.equal(nextStore, store) then return true end
    return commit(nextStore)
end
