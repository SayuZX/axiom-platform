local S = AxiomServerFeatures
local F = AxiomFullServer
local finite, elapsed, number, contains, state, rate, invokingResource, overrides = S.finite, S.elapsed, S.number, S.contains, S.state, S.rate, S.invokingResource, S.overrides

function S.entityRate(id, model)
    if not contains('Entity ratelimit whitelist', model) then
        local override = overrides[id]
        if override and elapsed(GetGameTimer(), override.at) > override.ttl then overrides[id] = nil; override = nil end
        rate(id, 'Entity ratelimit', override and override.limit or number('Entity ratelimit', F.getBaseConfig().entityLimit),
            override and override.seconds or number('Entity ratelimit timer', 15))
    end
end

-- Server resources call this before spawning a burst. No net event exposes it.
function S.setEntityRateLimit(id, limit, seconds, ttlSeconds)
    local resource, err = invokingResource()
    if not resource then return false, err end
    local s, player = state(id)
    if not s or not finite(limit) or limit < 1 or limit > 10000 or limit % 1 ~= 0
        or not finite(seconds) or seconds < 0.1 or seconds > 3600
        or not finite(ttlSeconds) or ttlSeconds < 1 or ttlSeconds > 3600 then
        return false, 'expected player, integer limit 1..10000, window 0.1..3600s, TTL 1..3600s'
    end
    overrides[player] = { limit = limit, seconds = seconds, at = GetGameTimer(), ttl = ttlSeconds * 1000, resource = resource }
    s.windows['Entity ratelimit'] = nil
    return true
end

exports('SetEntityRateLimit', S.setEntityRateLimit)
