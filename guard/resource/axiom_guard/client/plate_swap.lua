local C = AxiomClient
local rule = 'Anti plate swap'
local previous
C.register(rule, {
    check = function(s)
        local vehicle = GetVehiclePedIsIn(s.ped, false)
        if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= s.ped then previous = nil; return end
        local plate, model = GetVehicleNumberPlateText(vehicle), GetEntityModel(vehicle)
        if previous and previous.vehicle == vehicle and previous.model == model and previous.plate ~= plate then
            C.signal(rule, { before = previous.plate, after = plate, model = model })
        end
        previous = { vehicle = vehicle, plate = plate, model = model }
    end,
    reset = function()
        previous = nil
    end
})
