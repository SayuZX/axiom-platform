local S = AxiomServerFeatures
local on, set, report, cancel = S.on, S.set, S.report, S.cancel

function S.eventProtectionLog(player, name, resource)
    if on('EP: Log all events') then
        report(player, 'EP: Log all events', { event = name, resource = resource, scope = 'registered or explicitly integrated events only' })
    end
end

function S.eventProtection(player, name, resource)
    if set('EP: Whitelisted events')[name] then return true end
    if on('EP: Block bad events') and set('EP: Blacklisted events')[name] then
        local blocked = cancel(player, 'EP: Block bad events', { event = name, resource = resource,
            note = 'independent handlers must consult GuardEvent before side effects' })
        return not blocked
    end
    return true
end
