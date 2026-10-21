local S = AxiomServerFeatures

function S.giveWeapon(sender, data)
    S.remoteWeaponEvent(sender, data, 'Anti give weapon')
end
