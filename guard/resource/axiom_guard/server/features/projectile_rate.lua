local S = AxiomServerFeatures
local F = AxiomFullServer
local rate = S.rate

function S.projectileRate(id)
    rate(id, 'projectile_rate', F.getBaseConfig().projectileLimit, 10)
end
