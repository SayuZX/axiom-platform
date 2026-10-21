-- Loaded GTA TXDs can be legitimate. Never requests textures or attributes them to cheats.
local C = AxiomClient
local rule = 'Blacklisted textures'
local cursor = 1
C.register(rule, {
    menu = function(s)
        local textures = C.list[rule] or {}
        for _ = 1, math.min(16, #textures) do
            if cursor > #textures then cursor = 1 end
            local texture = textures[cursor]
            cursor = cursor + 1
            if HasStreamedTextureDictLoaded(texture) then
                C.signal(rule, { texture = texture, kind = 'loaded_texture_dictionary' })
            end
        end
    end,
    reset = function()
        cursor = 1
    end
})
