local S = AxiomServerFeatures
local F = AxiomFullServer
local elapsed, on, set, blocking, rate = S.elapsed, S.on, S.set, S.blocking, S.rate

function S.eventAI(player, s, name)
    if on('Event AI') and not set('Event AI whitelist')[name] then
        s.anomalies = s.anomalies or {}
        local now, bucket = GetGameTimer(), s.anomalies[name]
        if not bucket then
            local count = 0; for _ in pairs(s.anomalies) do count = count + 1 end
            if count < 128 then bucket = { at = now, count = 0, baseline = 0, windows = 0 }; s.anomalies[name] = bucket end
        end
        if bucket then
            if elapsed(now, bucket.at) >= 10000 then
                bucket.baseline = bucket.windows == 0 and bucket.count or bucket.baseline * 0.8 + bucket.count * 0.2
                bucket.windows, bucket.at, bucket.count = bucket.windows + 1, now, 0
            end
            bucket.count = math.min(bucket.count + 1, 100000)
            local threshold = math.max(30, bucket.baseline * 4 + 10)
            if bucket.windows >= 3 and bucket.count > threshold then
                local action = F.enforce(player, 'Event AI', { event = name, count = bucket.count, baseline = bucket.baseline,
                    threshold = threshold, windowSeconds = 10, method = 'AXIOM local EWMA rate anomaly', eventCancelled = false })
                if blocking(action) then return false end
            end
        end
    end
    return true
end
