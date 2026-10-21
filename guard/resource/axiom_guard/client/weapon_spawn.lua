-- Acquisition alone does not prove a spawn. No inventory mutation for this heuristic.
local C = AxiomClient
local rule = 'Anti weapon spawn'
C.register(rule, {
    inventory = function(s)
        if s.previous ~= nil and s.owned and s.previous ~= s.owned
            and not C.whitelisted('Anti weapon spawn whitelist', s.weapon) then
            C.signal(rule, { weapon = s.weapon, kind = 'local_weapon_acquired' })
        end
    end
})
