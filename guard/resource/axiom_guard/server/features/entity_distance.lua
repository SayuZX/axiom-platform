local S = AxiomServerFeatures
local number, contains, cancel, coords, distance = S.number, S.contains, S.cancel, S.coords, S.distance

function S.entityDistance(id, model, entity)
    local max = number('Entity create max distance', 0)
    if max > 0 and not contains('Entity max create distance whitelist', model) then
        local a, b = coords(GetPlayerPed(id)), coords(entity)
        if a and b and (b.x ~= 0 or b.y ~= 0 or b.z ~= 0) and distance(a, b) > max then
            cancel(id, 'Entity create max distance', { model = model, distance = distance(a, b), limit = max })
        end
    end
end
