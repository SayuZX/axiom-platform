local S = AxiomServerFeatures
local F = AxiomFullServer
local listed = S.listed

function S.samplePed(id, s)
    local ped = GetPlayerPed(id)
    if not ped or ped == 0 or not DoesEntityExist(ped) then return end
    local model = GetEntityModel(ped)
    if model ~= 0 and listed(model, 'Player ped list (blacklist/whitelist)', 'Player ped list type') then
        F.enforce(id, 'Player ped list (blacklist/whitelist)', { model = model, eventCancelled = false })
    end
end
