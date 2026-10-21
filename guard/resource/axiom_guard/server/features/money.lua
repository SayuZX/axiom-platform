local S = AxiomServerFeatures
local F = AxiomFullServer
local finite, number, on, diagnostic, state, report, blocking, invokingResource, validKey = S.finite, S.number, S.on, S.diagnostic, S.state, S.report, S.blocking, S.invokingResource, S.validKey

-- Server integrations own balances. No network route or client-supplied reason grants authority.
local function balanceSnapshot(balances)
    if type(balances) ~= 'table' then return nil end
    local current, count = {}, 0
    for account, amount in pairs(balances) do
        count = count + 1
        if count > 16 or not validKey(account) or #account > 64 or not finite(amount) then return nil end
        current[account] = amount
    end
    return count > 0 and current or nil
end
local function balanceGain(current, previous)
    local gain = 0
    for account, amount in pairs(current) do
        if previous[account] == nil then return nil end
        gain = gain + amount - previous[account]
    end
    for account in pairs(previous) do if current[account] == nil then return nil end end
    return finite(gain) and gain or nil
end
local function trusted(resource, origin)
    -- Only the selected owner bridge may attribute an upstream server resource.
    local config = S.config()
    local framework = config['Framework integration']
    local owner = framework == 'QBCore' and (config['QBCore resource'] or 'qb-core')
        or framework == 'ESX' and (config['ESX resource'] or 'es_extended')
    return S.set('Money trusted resources')[resource] == true
        or resource == owner and validKey(origin) and S.set('Money trusted resources')[origin] == true
end
local function gainWindow(s, identity)
    s.moneyBudgets = s.moneyBudgets or {}
    local buckets = s.moneyBudgets[identity]
    if not buckets then buckets = {}; s.moneyBudgets[identity] = buckets end
    local now, total = GetGameTimer(), 0
    local seconds = math.max(1, math.min(3600, number('Money gain window seconds', 60)))
    for key, bucket in pairs(buckets) do
        if S.elapsed(now, bucket.at) >= seconds * 1000 then buckets[key] = nil
        else total = total + bucket.gain end
    end
    return buckets, total, now, seconds
end
function S.trackBalances(id, balances, identity, origin)
    local resource, err = invokingResource()
    if not resource then return false, err end
    local s, player = state(id)
    local current = balanceSnapshot(balances)
    if not s or not current or not validKey(identity) then return false, 'connected player, complete balances and identity required' end
    s.money = s.money or {}
    local previous = s.money[resource]
    local gain = previous and previous.identity == identity and balanceGain(current, previous.balances) or nil
    local buckets, total, now = gainWindow(s, identity)
    if gain and gain > 0 and not trusted(resource, origin) then
        -- One-second buckets expire from their LAST commit: conservative by <1 second,
        -- bounded by the configured window, with no fixed-window boundary burst.
        local key = (now & 0xffffffff) // 1000
        local bucket = buckets[key]
        if bucket then bucket.gain, bucket.at = bucket.gain + gain, now
        else buckets[key] = { gain = gain, at = now } end
        total = total + gain
    end
    if gain and gain ~= 0 and not F.allowed(player) and on('Player money tracking') then
        report(player, 'Player money tracking', { netChange = gain, balances = current, resource = resource,
            phase = 'committed; report only' })
    end
    local limit, budget = number('Money gain limit', 0), number('Money gain budget', 0)
    if gain and gain > 0 and not trusted(resource, origin) and not F.allowed(player)
        and (limit > 0 and gain > limit or budget > 0 and total > budget) then
        diagnostic('Money gain limit', 'excess committed gain observed; caller must use GuardBalances before committing')
    end
    s.money[resource] = { identity = identity, balances = current }
    return true
end
exports('TrackBalances', S.trackBalances)

-- Serialize guard -> authoritative commit -> track. Proposals never consume budget.
-- Deductions do not refund budget; an atomic complete-account transfer has net gain zero.
function S.guardBalances(id, balances, identity, origin)
    local resource, err = invokingResource()
    if not resource then return false, err end
    local s, player = state(id)
    local current = balanceSnapshot(balances)
    if not s or not current or not validKey(identity) then return false, 'connected player, complete balances and identity required' end
    local limit, budget = number('Money gain limit', 0), number('Money gain budget', 0)
    local action = F.action(player, 'Money gain limit')
    if F.allowed(player) or trusted(resource, origin) or limit <= 0 and budget <= 0 or action == 'none' then return true end
    local previous = s.money and s.money[resource]
    if not previous or previous.identity ~= identity then return false, 'TrackBalances committed baseline required for this resource/session/identity' end
    local gain = balanceGain(current, previous.balances)
    if gain == nil then return false, 'account set changed or delta overflow; establish authoritative committed baseline' end
    if gain <= 0 then return true end
    local _, total, _, seconds = gainWindow(s, identity)
    if (limit <= 0 or gain <= limit) and (budget <= 0 or total + gain <= budget) then return true end
    local rejected = blocking(action)
    F.enforce(player, 'Money gain limit', { netGain = gain, limit = limit, committedGain = total,
        budget = budget, windowSeconds = seconds, resource = resource,
        phase = 'precommit', operationRejected = rejected, eventCancelled = false })
    return not rejected, rejected and action or nil
end
exports('GuardBalances', S.guardBalances)
