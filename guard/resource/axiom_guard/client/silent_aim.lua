-- Sampled, corroborated shot hits only. Missed samples are not evidence of innocence.
local C = AxiomClient
local rule = 'Anti SilentAim'
C.register(rule, {
    damage = function(s)
        C.accumulate(rule, s.distance > 10 and s.degrees > 12,
            { kind = 'repeated_shot_hit_outside_camera_cone', weapon = s.weapon,
                degrees = s.degrees, distance = s.distance }, 3, s.now)
    end
})
