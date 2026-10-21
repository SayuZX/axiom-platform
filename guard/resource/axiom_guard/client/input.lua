-- Native input acquisition and bounded scanning only; rule decisions live in feature files.
local C, I = AxiomClient, AxiomClient.input
local weaponList, weaponKnown, weaponCursor, catalogueRevision = {}, {}, 1, -1
local commandCursor, resourceCursor, commands, commandsAt = 1, 0, {}, -30000
local function trackWeapon(hash)
    hash = C.weaponHash(hash)
    if not hash or hash == C.unarmed or weaponKnown[hash] or #weaponList >= 512 then return end
    weaponKnown[hash] = true
    weaponList[#weaponList + 1] = hash
end
-- Vanilla catalogue plus configured/selected addons. Never-selected unknown addons
-- cannot be enumerated through HasPedGotWeapon.
local catalogue = [[
PISTOL COMBATPISTOL APPISTOL PISTOL50 SNSPISTOL HEAVYPISTOL VINTAGEPISTOL
MARKSMANPISTOL REVOLVER DOUBLEACTION CERAMICPISTOL NAVYREVOLVER GADGETPISTOL
MICROSMG SMG ASSAULTSMG COMBATPDW MACHINEPISTOL MINISMG TECPISTOL
PUMPSHOTGUN SAWNOFFSHOTGUN ASSAULTSHOTGUN BULLPUPSHOTGUN HEAVYSHOTGUN
DBSHOTGUN AUTOSHOTGUN COMBATSHOTGUN ASSAULTRIFLE CARBINERIFLE ADVANCEDRIFLE
SPECIALCARBINE BULLPUPRIFLE COMPACTRIFLE MILITARYRIFLE HEAVYRIFLE TACTICALRIFLE
MG COMBATMG GUSENBERG SNIPERRIFLE HEAVYSNIPER MARKSMANRIFLE PRECISIONRIFLE
KNIFE NIGHTSTICK HAMMER BAT GOLFCLUB CROWBAR BOTTLE DAGGER HATCHET
KNUCKLE MACHETE FLASHLIGHT SWITCHBLADE BATTLEAXE POOLCUE WRENCH STONE_HATCHET
RPG GRENADELAUNCHER GRENADELAUNCHER_SMOKE MINIGUN FIREWORK RAILGUN RAILGUNXM3
HOMINGLAUNCHER COMPACTLAUNCHER RAYPISTOL RAYCARBINE RAYMINIGUN EMP_LAUNCHER
GRENADE BZGAS MOLOTOV STICKYBOMB PROXMINE SNOWBALL PIPEBOMB BALL SMOKEGRENADE
FLARE PETROLCAN FIREEXTINGUISHER HAZARDCAN FERTILIZERCAN STUNGUN STUNGUN_MP
PISTOL_MK2 SMG_MK2 PUMPSHOTGUN_MK2 ASSAULTRIFLE_MK2 CARBINERIFLE_MK2
COMBATMG_MK2 HEAVYSNIPER_MK2 SNSPISTOL_MK2 REVOLVER_MK2 SPECIALCARBINE_MK2
BULLPUPRIFLE_MK2 MARKSMANRIFLE_MK2 FLAREGUN COMBATPISTOL MUSKET
]]
for name in catalogue:gmatch('%S+') do trackWeapon('WEAPON_' .. name) end
local catalogueRules = { 'Blacklisted weapons', 'Anti weapon spawn whitelist',
    'Infinite ammo weapon whitelist', 'Anti weapon damage whitelist',
    'Aimbot weapon whitelist', 'SilentAim whitelist' }
local function updateCatalogue()
    if catalogueRevision == C.revision then return end
    catalogueRevision = C.revision
    for _, rule in ipairs(catalogueRules) do
        for hash in pairs(C.hashes[rule] or {}) do
            if IsWeaponValid(hash) then trackWeapon(hash) end
        end
    end
end
C.onReset(function()
    C.inventory.owned = {}
    weaponCursor = 1
    commandCursor, resourceCursor, commands, commandsAt = 1, 0, {}, -30000
end)
C.inventory.owned = {}
function I.player(ped, player, now)
    local position, motion = GetEntityCoords(ped), C.motion
    local vehicle = IsPedInAnyVehicle(ped, false)
    local excluded = vehicle or IsPedRagdoll(ped) or IsPedSwimming(ped)
        or IsPedSwimmingUnderWater(ped) or IsPedClimbing(ped) or IsEntityAttached(ped)
        or IsPedInParachuteFreeFall(ped) or GetPedParachuteState(ped) >= 1
        or IsPedJumpingOutOfVehicle(ped)
    local elapsed = motion.time and now - motion.time or 0
    local gameplay, rendered = GetGameplayCamCoord(), GetFinalRenderedCamCoord()
    return {
        ped = ped, player = player, now = now, position = position, vehicle = vehicle,
        previousPosition = motion.position, excluded = excluded, elapsed = elapsed,
        speed = elapsed > 0 and elapsed < 2000 and motion.position
            and C.distance(position, motion.position) / elapsed * 3600 or 0,
        airborne = IsEntityInAir(ped), jumping = IsPedJumping(ped), falling = IsPedFalling(ped),
        height = GetEntityHeightAboveGround(ped), runSpeed = GetEntitySpeed(ped) * 3.6,
        cameraExcluded = NetworkIsInSpectatorMode() or vehicle
            or IsCinematicCamRendering() or IsCinematicIdleCamRendering(),
        rendered = rendered, gameplayDistance = C.distance(gameplay, position),
        renderedDistance = C.distance(rendered, position),
        weapon = C.weaponHash(GetSelectedPedWeapon(ped))
    }
end
function I.finishMovement(s)
    local motion = C.motion
    local grounded = not s.excluded and not s.airborne and not s.jumping and not s.falling
        and not GetEntityCollisionDisabled(s.ped) and s.height >= 0 and s.height < 1.5
        and HasCollisionLoadedAroundEntity(s.ped)
        and s.runSpeed <= C.number('Player max run speed (in km/h)', 45)
        and (s.elapsed == 0 or s.speed <= C.number('Player max run speed (in km/h)', 45))
    if grounded and not motion.restored then
        motion.safe = { ped = s.ped, model = GetEntityModel(s.ped), interior = GetInteriorFromEntity(s.ped),
            position = s.position, time = s.now }
    elseif s.excluded then
        motion.safe = nil
    end
    motion.position, motion.time = motion.restored or s.position, s.now
    motion.restored = nil
end
function I.inventory(ped)
    updateCatalogue()
    trackWeapon(GetSelectedPedWeapon(ped))
    local sample = { ped = ped }
    for _ = 1, math.min(24, #weaponList) do
        if weaponCursor > #weaponList then weaponCursor = 1 end
        local hash = weaponList[weaponCursor]
        weaponCursor = weaponCursor + 1
        sample.weapon, sample.owned = hash, HasPedGotWeapon(ped, hash, false)
        sample.previous = C.inventory.owned[hash]
        C.inventory.owned[hash] = sample.owned
        C.run('inventory', sample)
    end
end
function I.menu(now)
    if C.active('Blacklisted commands') or C.active('Menu detection strings') then
        if now - commandsAt >= 30000 or now < commandsAt then
            commands = C.native('Blacklisted commands', 'GetRegisteredCommands') or {}
            commandsAt, commandCursor = now, 1
        end
        local sample = {}
        for _ = 1, math.min(32, #commands) do
            if commandCursor > #commands then commandCursor = 1 end
            local command = commands[commandCursor]
            commandCursor = commandCursor + 1
            local name = type(command) == 'table' and command.name
            if type(name) == 'string' then sample.name = name; C.run('command', sample) end
        end
    end
    C.run('menu', { now = now })
end
function I.resources(visit)
    local count = GetNumResources()
    for _ = 1, math.min(16, count) do
        if resourceCursor >= count then resourceCursor = 0 end
        local name = GetResourceByFindIndex(resourceCursor)
        resourceCursor = resourceCursor + 1
        if name and GetResourceState(name) == 'started' then visit(name, 'started_resource_name') end
    end
end
function I.aim(s)
    local found, target = GetEntityPlayerIsFreeAimingAt(s.player)
    local valid = found and target ~= 0 and DoesEntityExist(target)
        and IsEntityAPed(target) and not IsEntityDead(target)
        and not C.whitelisted('Aimbot weapon whitelist', s.weapon)
    if C.config['Aimbot detection: Ignore custom recoil'] == true and IsGameplayCamShaking() then valid = false end
    if not valid then return end
    s.target, s.head = target, GetPedBoneCoords(target, 31086, 0.0, 0.0, 0.0)
    s.errorAngle = C.angle(s.forward, s.head - s.camera)
    s.sensitive = C.config['Aimbot detection sensitivity mode'] == 'Sensitive'
    s.required = s.sensitive and 3 or 5
end
function I.shot(ped, player, now)
    local weapon = C.weaponHash(GetSelectedPedWeapon(ped))
    if weapon == C.unarmed or GetWeaponDamageType(weapon) ~= 3 then C.resetShots(); return end
    local s = { ped = ped, player = player, now = now, weapon = weapon,
        ammo = GetAmmoInPedWeapon(ped, weapon), reload = IsPedReloading(ped) }
    local interval = C.native('Anti infinite ammo', 'GetWeaponTimeBetweenShots', weapon)
    local spacing = C.finite(interval) and math.max(100, interval * 900) or 150
    local newShot = IsPedShooting(ped) and (not C.shots.lastShot or now - C.shots.lastShot >= spacing)
    s.camera, s.forward = GetGameplayCamCoord(), C.direction(GetGameplayCamRot(2))
    C.run('sample', s)
    if newShot then
        C.shots.lastShot = now
        C.shots.current = { weapon = weapon, time = now, camera = s.camera, forward = s.forward }
        s.previousAim = C.shots.previousAim
        I.aim(s)
        C.run('shot', s)
    end
    C.shots.previousAim = { forward = s.forward, time = now }
end
-- Corroborate documented entity slots; never decode undocumented damage flags/offsets.
AddEventHandler('gameEventTriggered', function(name, args)
    local shot = C.shots.current
    if name ~= 'CEventNetworkEntityDamage' or type(args) ~= 'table' or not shot
        or not C.policyFresh() then return end
    local now, ped = GetGameTimer(), PlayerPedId()
    local victim = args[1]
    if args[2] ~= ped or type(victim) ~= 'number' or victim == ped
        or now - shot.time > 350 or shot.processed or not DoesEntityExist(victim)
        or not IsEntityAPed(victim) or not HasEntityBeenDamagedByEntity(victim, ped, true)
        or not HasEntityBeenDamagedByWeapon(victim, shot.weapon, 0)
        or C.whitelisted('SilentAim whitelist', shot.weapon) then return end
    shot.processed = true
    local target = GetPedBoneCoords(victim, 31086, 0.0, 0.0, 0.0)
    C.run('damage', { now = now, ped = ped, victim = victim, weapon = shot.weapon,
        distance = C.distance(target, shot.camera), degrees = C.angle(shot.forward, target - shot.camera) })
end)
