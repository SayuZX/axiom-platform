local S = AxiomServerFeatures
local label = 'Server weapon authorization'

-- Grants are server exports only: one equipped weapon per allowed resource/player session.
function S.authorizeWeapon(id, weapon, ttlSeconds)
    local resource, err = S.invokingResource()
    if not resource then return false, err end
    if not S.set(label .. ' resources')[resource] then return false, 'weapon authorization resource is not allowed' end
    local s = S.state(id)
    local hash = S.hash(weapon)
    if not s or not hash or hash == 0 or not S.finite(ttlSeconds) or ttlSeconds < 0.1 or ttlSeconds > 300 then
        return false, 'connected player, weapon name/hash and TTL 0.1..300s required'
    end
    s.weaponAuthorizations = s.weaponAuthorizations or {}
    s.weaponAuthorizations[resource] = { weapon = hash, at = GetGameTimer(), ttl = ttlSeconds * 1000 }
    return true
end

function S.revokeWeaponAuthorization(id)
    local resource, err = S.invokingResource()
    if not resource then return false, err end
    local s = S.state(id)
    if not s then return false, 'connected player required' end
    if s.weaponAuthorizations then s.weaponAuthorizations[resource] = nil end
    return true
end

exports('AuthorizeWeapon', S.authorizeWeapon)
exports('RevokeWeaponAuthorization', S.revokeWeaponAuthorization)

AddEventHandler('onResourceStop', function(resource)
    for _, s in pairs(S.players) do
        if s.weaponAuthorizations then s.weaponAuthorizations[resource] = nil end
    end
end)

local function granted(s, weapon)
    local grants = s.weaponAuthorizations
    if not grants then return false end
    local now, allowed = GetGameTimer(), S.set(label .. ' resources')
    for resource, grant in pairs(grants) do
        if not allowed[resource] or GetResourceState(resource) ~= 'started' or S.elapsed(now, grant.at) >= grant.ttl then
            grants[resource] = nil
        elseif grant.weapon == weapon then
            return true
        end
    end
    return false
end

local function inventoryWeapon(id, weapon, s)
    local I = AxiomIntegrations
    if not I or not I.selected('ox_inventory') then
        -- Standalone mode is explicit: only server grants and configured exceptions authorize weapons.
        if S.config()['Inventory integration'] == 'ox_inventory' then
            S.diagnostic(label, 'selected inventory adapter unavailable; weapon authorization fails open')
            return nil
        end
        return granted(s, weapon), 'no server weapon grant'
    end
    local resource = I.resource('ox_inventory')
    if type(resource) ~= 'string' or GetResourceState(resource) ~= 'started' then
        S.diagnostic(label, 'selected inventory resource unavailable; weapon authorization fails open')
        return nil
    end
    local ok, inventory, equipped = pcall(function()
        return exports[resource]:GetInventory(id), exports[resource]:GetCurrentWeapon(id)
    end)
    if not ok or type(inventory) ~= 'table' or inventory.id ~= id or not inventory.player or type(inventory.items) ~= 'table' then
        S.diagnostic(label, 'selected inventory state unavailable; weapon authorization fails open')
        return nil
    end
    if type(equipped) ~= 'table' or not S.finite(inventory.weapon) then return false, 'no inventory-equipped weapon' end
    local item = inventory.items[inventory.weapon]
    if type(item) ~= 'table' or equipped.slot ~= inventory.weapon or item.slot ~= inventory.weapon
        or equipped.name ~= item.name or not S.finite(item.count) or item.count < 1 then
        return false, 'equipped weapon absent from inventory slot'
    end
    if type(item.name) ~= 'string' or S.hash(item.name) ~= weapon then return false, 'weapon differs from inventory-equipped slot' end
    return true
end

-- Only damage/projectile weapon hashes are checked. Explosion tags never prove a weapon source.
function S.weaponAuthorization(id, weapon, eventName)
    local s, player = S.active(id)
    if not s or not S.on(label) then return true end
    if eventName ~= 'weaponDamageEvent' and eventName ~= 'startProjectileEvent' then return true end
    local hash = S.hash(weapon)
    if not hash or hash == 0 then
        S.diagnostic(label, 'event without usable weapon hash; weapon authorization fails open')
        return true
    end
    if S.contains(label .. ' whitelist', hash) then return true end
    if eventName == 'weaponDamageEvent' and S.contains(label .. ' indirect damage whitelist', hash) then return true end
    if S.contains(label .. ' vehicle whitelist', hash) then
        local ped = GetPlayerPed(player)
        local vehicle = ped and ped ~= 0 and S.native('GetVehiclePedIsIn', label, ped, false)
        if vehicle and vehicle ~= 0 and DoesEntityExist(vehicle) then return true end
    end
    local authorized, reason = inventoryWeapon(player, hash, s)
    if authorized == nil or authorized then return true end
    return not S.cancel(player, label, { weapon = hash, event = eventName, reason = reason,
        authority = 'server inventory equipped slot or resource-authorized session grant' })
end
