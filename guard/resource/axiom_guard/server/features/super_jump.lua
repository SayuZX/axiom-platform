local S = AxiomServerFeatures
local F = AxiomFullServer
local elapsed, on, native, coords = S.elapsed, S.on, S.native, S.coords

function S.sampleJump(id, s)
    if not on('Anti super jump (server-sided)') then s.jump = nil; return end
    local ped, now = GetPlayerPed(id), GetGameTimer()
    local p = coords(ped)
    if not p or elapsed(now, s.joined) < 15000 or GetEntityHealth(ped) <= 0 then s.jump = nil; return end
    local vehicle = native('GetVehiclePedIsIn', 'Anti super jump (server-sided)', ped, false)
    local ragdoll = native('IsPedRagdoll', 'Anti super jump (server-sided)', ped)
    if vehicle ~= 0 or ragdoll ~= false then s.jump = nil; return end
    local previous = s.jump
    local bucket = native('GetPlayerRoutingBucket', 'Anti super jump (server-sided)', id)
    if bucket == nil then s.jump = nil; return end
    s.jump = { at = now, coords = p, ped = ped, bucket = bucket, rises = 0 }
    if not previous or previous.ped ~= ped or previous.bucket ~= bucket then return end
    local dt = elapsed(now, previous.at)
    if dt < 100 or dt > 2500 then return end
    local rise = p.z - previous.coords.z
    local horizontal = math.sqrt((p.x-previous.coords.x)^2 + (p.y-previous.coords.y)^2)
    if rise > math.max(2.5, dt * 0.010) and horizontal < dt * 0.035 then
        s.jump.rises = previous.rises + 1
        if s.jump.rises >= 2 then
            F.enforce(id, 'Anti super jump (server-sided)', { rise = rise, milliseconds = dt, eventCancelled = false,
                note = 'repeated rapid on-foot ascent; server-coordinate heuristic, not proof of super jump' })
        end
    end
end
