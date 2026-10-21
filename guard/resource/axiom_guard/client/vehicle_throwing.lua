-- Nearest road vehicle only: bounded coverage; control is not attribution.
local C = AxiomClient
local rule = 'Anti vehicle throwing'
local previous
C.register(rule, {
    check = function(s)
        if not C.active(rule) then return end
        local p = s.position
        local nearby = GetClosestVehicle(p.x, p.y, p.z, 45.0, 0, 70)
        if nearby == 0 then previous = nil; return end
        local speed, model = GetEntitySpeed(nearby), GetEntityModel(nearby)
        if previous and previous.entity == nearby and previous.model == model then
            local elapsed = (s.now - previous.time) / 1000
            if elapsed > 0 and elapsed < 2 and speed - previous.speed > 25
                and NetworkHasControlOfEntity(nearby) and IsVehicleSeatFree(nearby, -1)
                and IsEntityInAir(nearby) and GetEntityHeightAboveGround(nearby) > 2
                and not HasEntityCollidedWithAnything(nearby) then
                C.signal(rule, { speed = speed, deltaSpeed = speed - previous.speed,
                    elapsed = elapsed, model = model, kind = 'controlled_unoccupied_vehicle_impulse' })
            end
        end
        previous = { entity = nearby, model = model, time = s.now, speed = speed }
    end,
    reset = function()
        previous = nil
    end
})
