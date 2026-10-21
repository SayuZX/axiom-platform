local C = AxiomClient
local rule = 'Anti vision modifiers'
C.register(rule, {
    check = function(s)
        if not C.active(rule) then return end
        local night = C.native(rule, 'GetUsingnightvision')
        local thermal = C.native(rule, 'GetUsingseethrough')
        C.observe(rule, night == true or thermal == true, { night = night, thermal = thermal })
    end,
    mitigate = function(ped, player, evidence)
        C.restoreNative(rule, evidence, 'SetNightvision', false)
        C.restoreNative(rule, evidence, 'SetSeethrough', false)
    end
})
