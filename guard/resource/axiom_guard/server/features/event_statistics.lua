local S = AxiomServerFeatures
local on, report, players = S.on, S.report, S.players

function S.eventStatsRecord(s)
    if on('EP: Log event stats') then
        s.eventCount = math.min((s.eventCount or 0) + 1, 1000000)
    end
end

function S.eventStatsFlush()
    for id, s in pairs(players) do
        if on('EP: Log event stats') and s.eventCount then
            report(id, 'EP: Log event stats', { count = s.eventCount, windowSeconds = 60,
                scope = 'registered and explicitly integrated events only' })
        end
        s.eventCount = nil
    end
end
