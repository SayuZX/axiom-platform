-- Driving/control never proves spawning. No guessed vehicle-removal remedy.
local C = AxiomClient
local rule = 'Anti local vehicle spawner'
C.register(rule, {
    check = function(s)
        local vehicle = GetVehiclePedIsIn(s.ped, false)
        if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= s.ped then C.streak[rule] = nil; return end
        C.observe(rule, not NetworkGetEntityIsNetworked(vehicle) and GetEntityPopulationType(vehicle) == 7,
            { kind = 'driving_nonnetworked_mission_vehicle', model = GetEntityModel(vehicle) }, 3000)
    end
})
