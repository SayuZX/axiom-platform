-- Sampled shots with identified targets only. Skill/aim assist/custom recoil can match.
-- Ignore custom recoil excludes observable camera shake, not arbitrary recoil code.
local C = AxiomClient
local rule = 'Aimbot detection'
C.register(rule, {
    shot = function(s)
        if not s.target then C.shotCounts[rule] = nil; return end
        local previous = s.previousAim
        local snap = previous and s.now - previous.time <= 150 and C.angle(previous.forward, s.forward) or 0
        C.accumulate(rule, snap > (s.sensitive and 15 or 25) and s.errorAngle < 0.8,
            { kind = 'repeated_shot_head_snap', degrees = snap, errorDegrees = s.errorAngle, weapon = s.weapon },
            s.required, s.now)
    end
})
