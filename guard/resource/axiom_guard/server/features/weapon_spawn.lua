local S = AxiomServerFeatures
local on, hash, contains, active, cancel, trustedEntity, scripted = S.on, S.hash, S.contains, S.active, S.cancel, S.trustedEntity, S.scripted

-- Stock weapon objects only; custom models use the explicit entity list.
-- https://docs.fivem.net/docs/game-references/weapon-models/
local weaponModels = {}
local function addWeaponModels(catalog)
    for weapon, model in catalog:gmatch('(%S+):(%S+)') do
        local key = hash(model)
        weaponModels[key] = weaponModels[key] or {}
        weaponModels[key][#weaponModels[key] + 1] = hash(weapon)
    end
end
addWeaponModels('weapon_revolver_mk2:w_pi_revolvermk2 weapon_heavypistol:w_pi_heavypistol weapon_marksmanpistol:w_pi_singleshot weapon_combatpdw:w_sb_pdw weapon_microsmg:w_sb_microsmg weapon_tecpistol:w_pi_pistolsmg_m31 weapon_smg:w_sb_smg weapon_smg_mk2:w_sb_smgmk2 weapon_minismg:w_sb_minismg weapon_machinepistol:w_sb_compactsmg weapon_assaultsmg:w_sb_assaultsmg weapon_fertilizercan:w_am_jerrycan_sf weapon_petrolcan:w_am_jerrycan weapon_hazardcan:w_ch_jerrycan weapon_wrench:w_me_wrench weapon_stone_hatchet:w_me_stonehatchet weapon_golfclub:w_me_gclub weapon_hammer:w_me_hammer weapon_candycane:w_me_candy_xm3 weapon_nightstick:w_me_nightstick weapon_crowbar:w_me_crowbar weapon_flashlight:w_me_flashlight weapon_dagger:w_me_dagger weapon_poolcue:w_me_poolcue weapon_bat:w_me_bat weapon_knife:w_me_knife_01 weapon_battleaxe:w_me_battleaxe weapon_stunrod:w_me_rod_m41 weapon_machete:w_me_machette_lr weapon_switchblade:w_me_switchblade weapon_hatchet:w_me_hatchet weapon_bottle:w_me_bottle weapon_hackingdevice:w_am_hackdevice_m32 weapon_stungun:w_pi_stungun weapon_stungun_mp:w_pi_stungun weapon_assaultrifle_mk2:w_ar_assaultriflemk2 weapon_compactrifle:w_ar_assaultrifle_smg weapon_battlerifle:w_sl_battlerifle_m32 weapon_bullpuprifle:w_ar_bullpuprifle weapon_carbinerifle:w_ar_carbinerifle weapon_bullpuprifle_mk2:w_ar_bullpupriflemk2 weapon_specialcarbine_mk2:w_ar_specialcarbinemk2 weapon_militaryrifle:w_ar_bullpuprifleh4 weapon_advancedrifle:w_ar_advancedrifle weapon_assaultrifle:w_ar_assaultrifle weapon_specialcarbine:w_ar_specialcarbine weapon_heavyrifle:w_ar_heavyrifleh weapon_tacticalrifle:w_ar_carbinerifle_reh weapon_carbinerifle_mk2:w_ar_carbineriflemk2 weapon_raycarbine:w_ar_srifle weapon_gusenberg:w_sb_gusenberg weapon_combatmg:w_mg_combatmg weapon_mg:w_mg_mg weapon_combatmg_mk2:w_mg_combatmgmk2 weapon_knuckle:w_me_knuckle weapon_metaldetector:w_am_digiscanner_reh')
addWeaponModels('weapon_snowlauncher:w_lr_compactsl_m32 weapon_compactlauncher:w_lr_compactgl weapon_minigun:w_mg_minigun weapon_grenadelauncher_smoke:w_lr_grenadelauncher weapon_hominglauncher:w_lr_homing weapon_railgun:w_ar_railgun weapon_firework:w_lr_firework weapon_grenadelauncher:w_lr_grenadelauncher weapon_rpg:w_lr_rpg weapon_rayminigun:w_mg_sminigun weapon_emplauncher:w_lr_compactml weapon_railgunxm3:w_ar_railgun_xm3 weapon_combatshotgun:w_sg_pumpshotgunh4 weapon_autoshotgun:w_sg_sweeper weapon_pumpshotgun:w_sg_pumpshotgun weapon_heavyshotgun:w_sg_heavyshotgun weapon_pumpshotgun_mk2:w_sg_pumpshotgunmk2 weapon_sawnoffshotgun:w_sg_sawnoff weapon_bullpupshotgun:w_sg_bullpupshotgun weapon_assaultshotgun:w_sg_assaultshotgun weapon_dbshotgun:w_sg_doublebarrel weapon_sniperrifle:w_sr_sniperrifle weapon_heavysniper_mk2:w_sr_heavysnipermk2 weapon_heavysniper:w_sr_heavysniper weapon_marksmanrifle_mk2:w_sr_marksmanriflemk2 weapon_precisionrifle:w_sr_precisionrifle_reh weapon_musket:w_ar_musket weapon_marksmanrifle:w_sr_marksmanrifle weapon_fireextinguisher:w_am_fire_exting weapon_snowball:w_ex_snowball weapon_ball:w_am_baseball weapon_molotov:w_ex_molotov weapon_stickybomb:w_ex_pe weapon_flare:w_am_flare weapon_grenade:w_ex_grenadefrag weapon_bzgas:w_ex_grenadesmoke weapon_proxmine:w_ex_apmine weapon_pipebomb:w_ex_pipebomb weapon_acidpackage:w_am_papers_xm3 weapon_smokegrenade:w_ex_grenadesmoke weapon_vintagepistol:w_pi_vintage_pistol weapon_pistol:w_pi_pistol weapon_pistolxm3:w_pi_pistol_xm3 weapon_appistol:w_pi_appistol weapon_ceramicpistol:w_pi_ceramic_pistol weapon_flaregun:w_pi_flaregun weapon_gadgetpistol:w_pi_singleshoth4 weapon_combatpistol:w_pi_combatpistol weapon_snspistol_mk2:w_pi_sns_pistolmk2 weapon_navyrevolver:w_pi_wep2_gun weapon_doubleaction:w_pi_wep1_gun weapon_pistol50:w_pi_pistol50 weapon_raypistol:w_pi_raygun weapon_snspistol:w_pi_sns_pistol weapon_pistol_mk2:w_pi_pistolmk2 weapon_revolver:w_pi_revolver')
local function allowedWeaponModel(model)
    if contains('Anti weapon spawn whitelist', model) then return true end
    for _, weapon in ipairs(weaponModels[hash(model)] or {}) do
        if contains('Anti weapon spawn whitelist', weapon) then return true end
    end
    return false
end

function S.weaponSpawn(entity)
    local s, id = active(NetworkGetEntityOwner(entity))
    local exempt = trustedEntity(entity)
    if not s or not scripted(entity) or exempt then return end
    local model = GetEntityModel(entity)
    if on('Anti weapon spawn') and GetEntityType(entity) == 3 and weaponModels[hash(model)]
        and not allowedWeaponModel(model) then
        cancel(id, 'Anti weapon spawn', { model = model, entityType = 3, scope = 'known stock weapon object models' })
    end
end
