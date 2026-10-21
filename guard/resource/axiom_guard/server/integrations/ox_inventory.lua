-- Lua 5.4, server/integrations/ox_inventory.lua, FiveM; explicitly selected inventory hook.
local I, hook, resource = AxiomIntegrations, nil, nil
I.register('ox_inventory', {
    start = function(name)
        resource = name
        hook = exports[name]:registerHook('openInventory', function(payload)
            if not I.selected('ox_inventory') or I.resource('ox_inventory') ~= name then return true end
            if type(payload) ~= 'table' or not AxiomRules.finite(payload.source) then return false end
            local id = payload.source
            local ped = GetPlayerPed(id)
            if ped == 0 or not DoesEntityExist(ped) then return false end
            local target = tostring(payload.inventoryType) .. ':' .. tostring(payload.inventoryId)
            if #target > 128 then return false end
            local allowed = GetInvokingResource() == name
            if payload.inventoryType == 'player' then
                local other = tonumber(payload.inventoryId)
                local otherPed = other and GetPlayerPed(other) or 0
                allowed = allowed and otherPed ~= 0 and DoesEntityExist(otherPed)
                    and GetPlayerRoutingBucket(id) == GetPlayerRoutingBucket(other)
                    and #(GetEntityCoords(ped) - GetEntityCoords(otherPed)) <= 16.0
            elseif payload.netId then
                local entity = NetworkGetEntityFromNetworkId(payload.netId)
                allowed = allowed and entity ~= 0 and DoesEntityExist(entity)
                    and #(GetEntityCoords(ped) - GetEntityCoords(entity)) <= 16.0
            end
            -- Inventory-owned permission/group checks precede this server hook.
            if allowed and not exports.axiom_guard:AuthorizeInventory(id, target, 1) then return false end
            return exports.axiom_guard:GuardInventory(id, target)
        end)
        if not hook then return nil, 'Inventory registerHook returned no handle' end
        return true
    end,
    stop = function(name)
        if hook and GetResourceState(name) == 'started' then exports[name]:removeHooks(hook) end
        hook, resource = nil, nil
    end
})
