local C = AxiomClient
local rule = 'Blacklisted commands'
C.register(rule, {
    command = function(s)
        for _, blocked in ipairs(C.list[rule] or {}) do
            if s.name:lower() == blocked:lower():gsub('^/', '') then
                C.signal(rule, { command = s.name, kind = 'registered_command' })
            end
        end
    end
})
