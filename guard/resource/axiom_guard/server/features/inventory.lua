local S = AxiomServerFeatures
local F = AxiomFullServer
local finite, elapsed, on, state, blocking, invokingResource, validKey = S.finite, S.elapsed, S.on, S.state, S.blocking, S.invokingResource, S.validKey

-- Target keys are inventory-owned server identifiers, not client permission claims.
-- One outstanding, one-use grant per resource/player; a new grant replaces the old one.
function S.authorizeInventory(id, target, ttlSeconds)
    local resource, err = invokingResource()
    if not resource then return false, err end
    local s = state(id)
    if not s or not validKey(target) or not finite(ttlSeconds) or ttlSeconds < 0.1 or ttlSeconds > 300 then
        return false, 'connected player, target key and TTL 0.1..300s required'
    end
    s.inventory = s.inventory or {}
    s.inventory[resource] = { target = target, at = GetGameTimer(), ttl = ttlSeconds * 1000 }
    return true
end

exports('AuthorizeInventory', S.authorizeInventory)

function S.guardInventory(id, target)
    local resource, err = invokingResource()
    if not resource then return false, err end
    local s, player = state(id)
    if not s or not validKey(target) then return false, 'connected player and target key required' end
    local grant = s.inventory and s.inventory[resource]
    if grant and elapsed(GetGameTimer(), grant.at) >= grant.ttl then s.inventory[resource] = nil; grant = nil end
    if grant and grant.target == target then s.inventory[resource] = nil; return true end
    if F.allowed(player) or not on('Anti open inventory') then return true end
    local action = F.action(player, 'Anti open inventory')
    if action == 'none' then return true end
    local rejected = blocking(action)
    F.enforce(player, 'Anti open inventory', { resource = resource, target = target,
        reason = 'no unexpired server authorization for exact target', operationRejected = rejected, eventCancelled = false })
    return not rejected, rejected and action or nil
end

exports('GuardInventory', S.guardInventory)
