local S = AxiomServerFeatures
local F = AxiomFullServer
local contains, cancel, legacyBlocked = S.contains, S.cancel, S.legacyBlocked

function S.weaponBlocked(id, weapon)
    if contains('Blacklisted weapons', weapon) then cancel(id, 'Blacklisted weapons', { weapon = weapon }) end
    local old = F.getProtection()
    if legacyBlocked(weapon, old.weapons, old.allowedWeapons) then cancel(id, 'weapon_blacklist', { weapon = weapon }) end
end
