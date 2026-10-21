-- Occlusion/offscreen heuristic; legitimate bullet penetration can match.
local C = AxiomClient
local rule = 'Anti SilentAim V2'
C.register(rule, {
    damage = function(s)
        C.accumulate(rule, s.distance > 10
            and not HasEntityClearLosToEntity(s.ped, s.victim, 17) and not IsEntityOnScreen(s.victim),
            { kind = 'repeated_offscreen_occluded_shot_hit', weapon = s.weapon, distance = s.distance }, 4, s.now)
    end
})
