-- Local inventory transitions can be legitimate scripts/pickups; no grant remedy.
local C = AxiomClient
local rule = 'Anti remove weapon'
C.register(rule, {
    inventory = function(s)
        if s.previous ~= nil and not s.owned and s.previous ~= s.owned then
            C.signal(rule, { weapon = s.weapon, kind = 'local_inventory_transition', owned = s.owned })
        end
    end
})
