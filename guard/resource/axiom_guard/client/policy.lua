local C = AxiomClient
RegisterNetEvent('axiom_guard:fullConfig', function(values, nextRevision, nextPolicy)
    if source ~= 65535 or not C.finite(nextRevision) or nextRevision % 1 ~= 0
        or nextRevision < 0 or nextRevision < C.revision then return end
    if type(values) ~= 'table'
        and not (values == nil and C.received and nextRevision == C.revision) then return end
    if type(nextPolicy) ~= 'table' or (nextPolicy.mode ~= 'monitor' and nextPolicy.mode ~= 'protect')
        or not C.finite(nextPolicy.ttlMs) or nextPolicy.ttlMs <= 0
        or type(nextPolicy.exempt) ~= 'boolean' or type(nextPolicy.rules) ~= 'table' then
        C.policy, C.policyAt = nil, nil
        C.reset()
        return
    end
    local wasFresh = C.policyFresh()
    C.policy, C.policyAt = nextPolicy, GetGameTimer()
    -- Same-revision heartbeats renew the lease, never preserve stale/exempt baselines.
    if nextRevision == C.revision then
        if not wasFresh or not C.policyFresh() then C.reset() end
        return
    end
    C.config, C.list, C.hashes = values, {}, {}
    for rule, value in pairs(values) do
        if type(rule) == 'string' and type(value) == 'table' then
            C.list[rule], C.hashes[rule] = {}, {}
            for i = 1, math.min(#value, 256) do
                local item = value[i]
                if type(item) == 'string' and #item <= 128 then
                    C.list[rule][#C.list[rule] + 1] = item
                    local hash = C.weaponHash(item)
                    if hash then C.hashes[rule][hash] = true end
                elseif C.finite(item) then
                    local hash = C.weaponHash(item)
                    if hash then C.hashes[rule][hash] = true end
                end
            end
            if #value > 256 then print('[axiom_guard] list exceeds client limit: ' .. rule) end
        end
    end
    C.revision, C.received = nextRevision, true
    C.reset()
end)
CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(1000) end
    repeat
        TriggerServerEvent('axiom_guard:requestFullConfig')
        Wait(15000)
    until C.received
end)
