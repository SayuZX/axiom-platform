-- Same-model bounds drift only; no bone/physics hitbox access.
-- An already-modified model at the first observation cannot be identified.
local C = AxiomClient
local rule = 'Anti hitbox modification'
local baseline = {}
C.register(rule, {
    check = function(s)
        if not C.active(rule) then return end
        local model = GetEntityModel(s.ped)
        local minimum, maximum = C.native(rule, 'GetModelDimensions', model)
        if not minimum or not maximum then return end
        if baseline.model ~= model then
            baseline = { model = model, minimum = minimum, maximum = maximum }
            C.streak[rule] = nil
        else
            local drift = math.max(C.distance(minimum, baseline.minimum), C.distance(maximum, baseline.maximum))
            C.observe(rule, drift > 0.05, { kind = 'model_bounds_changed', model = model, drift = drift })
        end
    end,
    reset = function()
        baseline = {}
    end
})
