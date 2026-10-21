local B = AxiomBackend
local cache, pending, cacheCount = {}, {}, 0
local requiredScore = { Off = 0, Orange = 20, Yellow = 40, Lime = 60, Green = 80 }

local function contains(ids, value)
    for _, id in ipairs(ids) do if id == value then return true end end
    return false
end

function B.addressAllowed(address, entries, ids, uid)
    local ip = B.ipv4(address)
    for _, entry in ipairs(entries or {}) do
        if type(entry) == 'string' then
            if entry == address or (uid ~= nil and entry == uid) or contains(ids or {}, entry) then return true end
            local network, bits = entry:match('^([^/]+)/(%d+)$')
            local subnet, prefix = B.ipv4(network), tonumber(bits)
            if ip and subnet and prefix and prefix >= 0 and prefix <= 32 then
                local divisor = 2 ^ (32 - prefix)
                if math.floor(ip / divisor) == math.floor(subnet / divisor) then return true end
            end
        end
    end
    return false
end

-- Decimal long division preserves Discord's uint64 snowflake above double precision.
local function discordCreated(identifier)
    local digits = identifier:match('^discord:(%d+)$')
    if not digits or #digits > 20 then return nil end
    local carry, quotient = 0, 0
    for index = 1, #digits do
        carry = carry * 10 + tonumber(digits:sub(index, index))
        quotient = quotient * 10 + math.floor(carry / 4194304)
        carry = carry % 4194304
    end
    return (quotient + 1420070400000) / 1000
end

local function urlEncode(value)
    return (value:gsub('[^%w%-._~]', function(character) return ('%%%02X'):format(character:byte()) end))
end

local function vpn(address, callback)
    local verdict = cache[address]
    if verdict and verdict.expires > os.time() then callback(verdict.blocked); return end
    if pending[address] then pending[address][#pending[address] + 1] = callback; return end
    pending[address] = { callback }
    local finished = false
    local function finish(blocked, error)
        if finished then return end
        finished = true
        local callbacks = pending[address] or {}
        pending[address] = nil
        if blocked ~= nil then
            if not cache[address] then
                if cacheCount >= 4096 then local first = next(cache); if first then cache[first] = nil; cacheCount = cacheCount - 1 end end
                cacheCount = cacheCount + 1
            end
            cache[address] = { blocked = blocked, expires = os.time() + 600 }
        end
        for _, done in ipairs(callbacks) do
            local ok, problem = pcall(done, blocked, error)
            if not ok then print('[AXIOM BACKEND] Admission callback: ' .. tostring(problem)) end
        end
    end
    SetTimeout(4500, function() finish(nil, 'timeout') end)
    local endpoint = 'https://proxycheck.io/v3/' .. address .. '?tag=0&short=1'
    local key = GetConvar('axiom_guard_proxycheck_key', '')
    if key ~= '' then endpoint = endpoint .. '&key=' .. urlEncode(key) end
    local started = pcall(PerformHttpRequest, endpoint, function(status, body)
        if finished then return end
        if status ~= 200 or type(body) ~= 'string' or #body > 65536 then finish(nil, 'HTTP ' .. tostring(status)); return end
        local ok, result = pcall(json.decode, body)
        local record = ok and type(result) == 'table' and result[address]
        local detections = ok and type(result) == 'table' and (result.detections or type(record) == 'table' and record.detections)
        if type(detections) ~= 'table' or type(detections.vpn) ~= 'boolean'
            or (detections.proxy ~= nil and type(detections.proxy) ~= 'boolean') or (detections.tor ~= nil and type(detections.tor) ~= 'boolean') then
            finish(nil, 'invalid provider response'); return
        end
        finish(detections.vpn or detections.proxy == true or detections.tor == true)
    end, 'GET', '', { ['Accept'] = 'application/json' }, { followLocation = false })
    if not started then finish(nil, 'native HTTP unavailable') end
end

function B.admit(identifiers, callback, playerId)
    if type(callback) ~= 'function' then return nil, 'Admission callback required' end
    if not B.array(identifiers, 32) then callback({ allowed = false, reason = 'Invalid native identifiers', findings = {}, score = 0 }); return end
    for _, id in ipairs(identifiers) do
        if not B.text(id, 160) then callback({ allowed = false, reason = 'Invalid native identifiers', findings = {}, score = 0 }); return end
    end
    local ids = B.copy(identifiers)
    local uid, license = B.primary(B.strongIdentifiers(ids))
    local values = B.configState.values
    local findings, now = {}, os.time()
    local function add(rule, reason, details)
        local item = details or {}
        item.rule, item.reason = rule, reason
        findings[#findings + 1] = item
    end
    local function exempt(key)
        for _, entry in ipairs(values[key] or {}) do if entry == uid or contains(ids, entry) then return true end end
        return false
    end
    for _, kind in ipairs(values['Required identifier types'] or {}) do
        local present, prefix = false, tostring(kind) .. ':'
        for _, id in ipairs(ids) do if id:sub(1, #prefix) == prefix then present = true; break end end
        if not present then add('Required identifier types', 'Missing required identifier: ' .. tostring(kind)) end
    end
    if values['Discord account min age (days)'] > 0 and not exempt('Account age whitelist') then
        for _, id in ipairs(ids) do
            if id:sub(1, 8) == 'discord:' then
                local created = discordCreated(id)
                if not created then add('Discord account min age (days)', 'Invalid Discord snowflake identifier')
                else
                    local days = (now - created) / 86400
                    if days < values['Discord account min age (days)'] then add('Discord account min age (days)', 'Discord account age below configured minimum', { days = days }) end
                end
                break
            end
        end
    end
    if values['Anti duplicate licenses'] and license then
        for _, other in ipairs(GetPlayers()) do
            if playerId == nil or tonumber(other) ~= tonumber(playerId) then
                local _, otherLicense = B.primary(B.strongIdentifiers(GetPlayerIdentifiers(other)))
                if otherLicense == license then add('Anti duplicate licenses', 'Duplicate license connection'); break end
            end
        end
    end
    local policy = B.banSnapshot()
    local ban = AxiomRules.localBan(policy, ids, B.stamp())
    if ban then
        local reason = (values['Default ban message'] or '[AXIOM GUARD] Local ban: {reason}'):gsub('{reason}', function() return ban.reason end)
        add('local_ban', reason .. '\n' .. (values['Ban rejection message'] or ''), { banId = ban.id })
    end
    local activeBans = 0
    for _, record in ipairs(policy.bans) do if record.uid == uid then activeBans = activeBans + 1 end end
    local detections = 0
    local identity = uid and B.history and B.history.identities[uid]
    for _, at in ipairs(identity and identity.highDetections or {}) do if at >= now - 30 * 86400 then detections = detections + 1 end end
    local score = math.max(0, 100 - activeBans * 60 - math.min(40, detections * 5))
    if score < (requiredScore[values['Required TrustScore']] or 0) and not exempt('TrustScore whitelist') then
        add('Required TrustScore', values['TrustScore rejection message'] or 'Local AXIOM history score below threshold', { score = score })
    end
    local address = B.addresses(ids)[1]
    if address and values['Enable IP bans'] ~= 'Disabled' and not B.addressAllowed(address, values['IP ban whitelist'], ids, uid) then
        local prefix = values['Enable IP bans'] == 'Yes, exact IP' and 32 or values['Enable IP bans'] == 'Yes, /24 subnet' and 24 or 16
        local divisor = 2 ^ (32 - prefix)
        local ip, age = math.floor(B.ipv4(address) / divisor), values['IP ban expiration (days)']
        local matched = false
        for _, record in ipairs(policy.bans) do
            if age == 0 or now - (B.epoch(record.createdAt) or 0) < age * 86400 then
                local known = B.history and B.history.identities[record.uid]
                for _, addresses in ipairs({ record.addresses or {}, known and known.addresses or {} }) do
                    for _, candidate in ipairs(addresses) do
                        local numeric = B.ipv4(candidate)
                        if numeric and math.floor(numeric / divisor) == ip then matched = true; break end
                    end
                    if matched then break end
                end
            end
            if matched then break end
        end
        if matched then add('Enable IP bans', 'Connection matches an active local IP ban', { scope = prefix == 32 and 'exact' or '/' .. prefix }) end
    end
    local done = false
    local function finish()
        if done then return end
        done = true
        local applicable, denied = {}, nil
        for _, finding in ipairs(findings) do
            local setting = values['Detection settings'][finding.rule]
            if not setting or setting.enabled ~= false then
                if setting and setting.action == 'monitor' then finding.observeOnly = true end
                applicable[#applicable + 1] = finding
                if not finding.observeOnly and not denied then denied = finding end
            end
        end
        callback({ allowed = B.configState.config.mode ~= 'protect' or denied == nil, reason = denied and denied.reason or nil,
            findings = applicable, score = score, scope = 'local server-observed ban/detection history; client reports tracked separately' })
    end
    if address and values['Anti VPN'] and not B.addressAllowed(address, values['Anti VPN whitelist'], ids, uid) then
        vpn(address, function(blocked, error)
            if blocked == nil then add('Anti VPN', 'VPN reputation unavailable; connection is not denied for this check', { observeOnly = true, diagnostic = error })
            elseif blocked then add('Anti VPN', 'VPN/proxy/Tor connection detected by proxycheck.io') end
            finish()
        end)
    else finish() end
end
