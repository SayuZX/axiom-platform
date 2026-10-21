local S = AxiomServerFeatures
local elapsed, number, diagnostic, contains, cancel, playerWhitelist = S.elapsed, S.number, S.diagnostic, S.contains, S.cancel, S.playerWhitelist

function S.entityPlaytime(id, s, model, evidence)
    local minutes = number('Minimum play time for entity spawning (minutes)', 0)
    if minutes > 0 and not s.joinKnown then
        diagnostic('Minimum play time for entity spawning (minutes)', 'pre-existing session join time unknown after resource restart; fails open')
    end
    if minutes > 0 and s.joinKnown and elapsed(GetGameTimer(), s.joined) < minutes * 60000
        and not contains('Minimum play time spawn whitelist', model)
        and not playerWhitelist(id, 'Minimum play time spawn whitelist') then
        cancel(id, 'Minimum play time for entity spawning (minutes)', evidence)
    end
end
