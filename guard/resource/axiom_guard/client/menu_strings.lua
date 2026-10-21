-- Only registered command/started resource names; no arbitrary memory or NUI string access.
local C = AxiomClient
local rule = 'Menu detection strings'
local function checkString(value, kind)
    local folded = value:lower()
    for _, pattern in ipairs(C.list[rule] or {}) do
        if pattern ~= '' and folded:find(pattern:lower(), 1, true) then
            C.signal(rule, { kind = kind, value = value, match = pattern })
            return
        end
    end
end
C.register(rule, {
    command = function(s)
        checkString(s.name, 'registered_command_name')
    end,
    menu = function(s)
        if C.active(rule) then C.input.resources(checkString) end
    end
})
