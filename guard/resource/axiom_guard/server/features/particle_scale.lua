local S = AxiomServerFeatures
local finite, number, cancel = S.finite, S.number, S.cancel

function S.particleScale(id, data)
    local scale = number('Max particle scale', 0)
    if scale > 0 and finite(data.scale) and (data.scale < 0 or data.scale > scale) then
        cancel(id, 'Max particle scale', { effect = data.effectHash, scale = data.scale, limit = scale })
    end
end
