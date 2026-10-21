local S = AxiomServerFeatures

function S.removeWeapon(sender, data)
    S.remoteWeaponEvent(sender, data, 'Anti remove weapon')
end
