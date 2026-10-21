local S = AxiomServerFeatures
local number, native, cancel, distance = S.number, S.native, S.cancel, S.distance

function S.killDistance(id, data, weapon, target, range, tolerance)
    local max = number('Max player kill distance', 0)
    if max > 0 and data.willKill == true and native('IsPedAPlayer', 'Max player kill distance', target) == true
        and range > max + tolerance then
        cancel(id, 'Max player kill distance', { distance = range, limit = max, tolerance = tolerance, weapon = weapon })
    end
end
