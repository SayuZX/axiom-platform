local S = AxiomServerFeatures
local state, players, tracked, overrides = S.state, S.players, S.tracked, S.overrides

function S.playerJoining()
    local s = state(source)
    if s then s.joined, s.joinKnown = GetGameTimer(), true end
end

function S.playerDropped()
    local id = tonumber(source)
    if not id then return end
    players[id], overrides[id] = nil, nil
    for entity, record in pairs(tracked) do
        if record.owner == id then tracked[entity] = nil; S.trackedCount = S.trackedCount - 1 end
    end
end

function S.resourceStopped(resource)
    for id, override in pairs(overrides) do if override.resource == resource then overrides[id] = nil end end
    for _, s in pairs(players) do
        if s.money then s.money[resource] = nil end
        if s.inventory then s.inventory[resource] = nil end
    end
end
