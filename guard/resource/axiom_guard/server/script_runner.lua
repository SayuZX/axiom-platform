-- Lua source executes in the bounded native worker; FiveM applies validated operations.
AxiomScripts = {}
function AxiomScripts.apply(plan, id)
    if type(plan) ~= 'table' or type(plan.operations) ~= 'table' or #plan.operations > 16 then return false, 'Invalid script operation plan.' end
    for _, operation in ipairs(plan.operations) do
        if type(operation) ~= 'table' then return false, 'Invalid operation.' end
        if operation.type == 'freeze' then
            if type(operation.value) ~= 'boolean' then return false, 'Invalid freeze value.' end
        elseif operation.type == 'teleport' then
            for _, key in ipairs({ 'x', 'y', 'z' }) do
                local value = operation[key]
                if type(value) ~= 'number' or value ~= value or math.abs(value) > 100000 then return false, 'Invalid coordinates.' end
            end
        elseif operation.type ~= 'disarm' then return false, 'Unsupported script operation.' end
    end
    local ok, failure = pcall(function()
        for _, operation in ipairs(plan.operations) do
            local ped = GetPlayerPed(id)
            if ped == 0 or not DoesEntityExist(ped) then error('Player ped unavailable.') end
            if operation.type == 'disarm' then RemoveAllPedWeapons(ped, true)
            elseif operation.type == 'freeze' then FreezeEntityPosition(ped, operation.value)
            elseif operation.type == 'teleport' then SetEntityCoords(ped, operation.x, operation.y, operation.z, false, false, false, false) end
        end
    end)
    if not ok then return false, tostring(failure) end
    return true, { output = plan.output, result = plan.result, operationsApplied = #plan.operations }
end
