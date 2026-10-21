-- Local inventory transitions can be legitimate scripts/pickups; no removal remedy.
local C = AxiomClient
local rule = 'Anti give weapon'
C.register(rule, {
    inventory = function(s)
        if s.previous ~= nil and s.owned and s.previous ~= s.owned then
            C.signal(rule, { weapon = s.weapon, kind = 'local_inventory_transition', owned = s.owned })
        end
    end
})
