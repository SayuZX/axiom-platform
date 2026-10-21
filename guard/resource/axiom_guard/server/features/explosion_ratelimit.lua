local S = AxiomServerFeatures
local F = AxiomFullServer
local explosion = S.explosion
local number, set, rate = S.number, S.set, S.rate

function S.explosionRate(id, kind)
    if not set('Explosion ratelimit whitelist', explosion)[kind] then
        rate(id, 'Explosion ratelimit', number('Explosion ratelimit', F.getBaseConfig().explosionLimit),
            number('Explosion ratelimit timer', 45))
    end
end
