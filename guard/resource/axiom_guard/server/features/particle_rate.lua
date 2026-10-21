local S = AxiomServerFeatures
local F = AxiomFullServer
local rate = S.rate

function S.particleRate(id)
    rate(id, 'particle_rate', F.getBaseConfig().particleLimit, 10)
end
