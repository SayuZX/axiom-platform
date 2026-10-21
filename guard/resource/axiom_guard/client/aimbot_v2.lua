-- Repeated target-lock heuristic, not proof. Skill/aim assist/custom recoil can match.
local C = AxiomClient
local rule = 'Aimbot detection V2'
local lock
C.register(rule, {
    shot = function(s)
        if not s.target then C.shotCounts[rule], lock = nil, nil; return end
        local moved = lock and lock.target == s.target and s.now - lock.time < 1500
            and C.distance(lock.head, s.head) > 0.3
        C.accumulate(rule, moved and s.errorAngle < (s.sensitive and 0.12 or 0.06)
            and math.abs(s.errorAngle - lock.error) < 0.04,
            { kind = 'repeated_moving_target_head_lock', errorDegrees = s.errorAngle, weapon = s.weapon },
            s.required + 2, s.now)
        lock = { target = s.target, head = s.head, error = s.errorAngle, time = s.now }
    end,
    resetShot = function()
        lock = nil
    end
})
