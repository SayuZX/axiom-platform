local S = AxiomServerFeatures
local number, on, hash, cancel, distance = S.number, S.on, S.hash, S.cancel, S.distance

local stunWeapons = { [hash('WEAPON_STUNGUN')] = true, [hash('WEAPON_STUNGUN_MP')] = true }

function S.taze(id, weapon, range, tolerance)
    if on('Anti taze') and stunWeapons[hash(weapon)] then
        local max = number('Anti taze (max distance)', 20)
        if max > 0 and range > max + tolerance then
            cancel(id, 'Anti taze', { distance = range, limit = max, tolerance = tolerance, weapon = weapon })
        end
    end
end
