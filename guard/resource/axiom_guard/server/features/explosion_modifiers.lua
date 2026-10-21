local S = AxiomServerFeatures
local explosion = S.explosion
local finite, on, set, cancel = S.finite, S.on, S.set, S.cancel

function S.explosionModifiers(id, data, kind)
    if on('Block explosion modifiers') and not set('Explosion modifier whitelist', explosion)[kind] then
        if finite(data.damageScale) and data.damageScale > 1.0 or data.isInvisible == true then
            cancel(id, 'Block explosion modifiers', { explosionType = kind,
                damageScale = data.damageScale, invisible = data.isInvisible })
        end
    end
end
