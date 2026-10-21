# Python3 + lupa.lua54: execute real feature modules with an isolated FiveM native host.
from pathlib import Path
import json
import re
from lupa.lua54 import LuaRuntime

root = Path(__file__).parent / 'resource/axiom_guard'
manifest = (root / 'fxmanifest.lua').read_text()
modules = {side: re.findall(r"'([^']+\.lua)'", re.search(side + r'_scripts\s*\{(.*?)\}', manifest, re.S)[1]) for side in ('server', 'client')}

def load(lua, paths):
    for path in paths:
        lua.execute((root / path).read_text(), name=path)

def table(lua, value):
    if isinstance(value, dict): return lua.table_from({key: table(lua, item) for key, item in value.items()})
    if isinstance(value, list): return lua.table_from([table(lua, item) for item in value])
    return value

lua = LuaRuntime(unpack_returned_tuples=True)
for path in root.rglob('*.lua'):
    lua.eval('function(s,n) local f,e=load(s,n); assert(f,e) end')(path.read_text(), str(path))
values = json.loads((root / 'shared/catalog.json').read_text())['values']
values['Server-event logs'] = 'None'
lua.globals().settings = table(lua, values)
lua.execute('''
clock=0; handlers={}; threads={}; reports={}; cancellations={}; exported={}; mode='monitor'; source=1; invoking='independent-resource'
function GetGameTimer() return clock end
function GetConvar(_,fallback) return fallback end
function SetConvar() end
function GetCurrentResourceName() return 'axiom_guard' end
function GetPlayerName(id) if tonumber(id)==1 then return 'Standalone' end end
function GetPlayers() return {'1'} end
function GetPlayerIdentifiers() return {'license:abc'} end
function GetResourceState() return 'started' end
function GetInvokingResource() return invoking end
function GetHashKey(s) if type(s)=='number' then return s end local h=0;for i=1,#s do h=(h*31+s:lower():byte(i))&0xffffffff end return h end
function GetPlayerPed() return 100 end
function DoesEntityExist(e) return e~=0 end
function GetEntityCoords(e) return {x=e==100 and 1 or 100,y=1,z=1} end
function GetEntityType(e) return e==100 and 1 or 2 end
function GetEntityModel(e) return GetHashKey(e==100 and 'player_zero' or 'tug') end
function NetworkGetEntityOwner() return 1 end
function NetworkGetFirstEntityOwner() return 1 end
function GetEntityScript() return 'vehicle-resource' end
function GetEntityPopulationType() return 7 end
function IsPedAPlayer(e) return e==100 end
function GetPlayerPing() return 20 end
function AddEventHandler(name,fn) handlers[name]=handlers[name] or {};table.insert(handlers[name],fn);return fn end
function RegisterNetEvent() end
function RemoveEventHandler() end
function CreateThread(fn) table.insert(threads,coroutine.create(fn)) end
function Wait() coroutine.yield() end
function exports(name,fn) exported[name]=fn end
function fire(name,...) for _,fn in ipairs(handlers[name] or {}) do fn(...) end end
function ruleCount(name) local n=0;for _,r in ipairs(cancellations) do if r==name then n=n+1 end end return n end
function replaceConfig() local c={};for k,v in pairs(settings)do c[k]=v end;settings=c end
AxiomFullServer={getConfig=function()return settings end,getBaseConfig=function()return {entityLimit=35,explosionLimit=12,projectileLimit=30,particleLimit=25,damageLimit=500}end,getProtection=function()return {}end,getMode=function()return mode end,allowed=function()return false end,report=function(id,r,e,t)table.insert(reports,r)end,cancel=function(id,r,e)table.insert(cancellations,r);return mode=='protect'end}
AxiomFullServer.action=function(id,r)return mode=='protect' and 'cancel' or 'monitor'end
AxiomFullServer.enforce=function(id,r,e)table.insert(reports,r);return AxiomFullServer.action(id,r)end
''')
load(lua, [p for p in modules['server'] if p.startswith('server/feature')])
lua.execute('''
fire('entityCreating',200);assert(ruleCount('Entity list (blacklist/whitelist)')==1)
settings['Resource entity whitelist']={'vehicle-resource'};replaceConfig()
fire('entityCreating',200);assert(ruleCount('Entity list (blacklist/whitelist)')==1,'resource exemption')
settings['Explosion list type']='Blacklist';settings['Explosion list (blacklist/whitelist)']={'EXP_TAG_GRENADE'}
settings['Explosion ratelimit']=1;settings['Explosion ratelimit whitelist']={'EXP_TAG_GRENADE'};replaceConfig()
fire('explosionEvent',1,{explosionType=0,damageScale=1,isInvisible=false});fire('explosionEvent',1,{explosionType=0,damageScale=1,isInvisible=false})
assert(ruleCount('Explosion list (blacklist/whitelist)')==2);assert(ruleCount('Explosion ratelimit')==0)
settings['Allowed particles']={'safe_effect'};replaceConfig()
fire('ptFxEvent',1,{effectHash=GetHashKey('safe_effect'),scale=999,isOnEntity=false});assert(ruleCount('Max particle scale')==0)
fire('ptFxEvent',1,{effectHash=GetHashKey('unsafe_effect'),scale=999,isOnEntity=false});assert(ruleCount('Max particle scale')==1)
settings['EP: Blacklisted events']={'app:danger'};settings['EP: Whitelisted events']={'app:danger'};replaceConfig()
assert(exported.GuardEvent(1,'app:danger'));settings['EP: Whitelisted events']={};replaceConfig()
mode='protect';assert(not exported.GuardEvent(1,'app:danger'));mode='monitor';assert(exported.GuardEvent(1,'app:danger'))
settings['Money gain limit']=100;settings['Anti open inventory']=true;replaceConfig();mode='protect'
assert(exported.TrackBalances(1,{cash=10,bank=20},'character'))
assert(exported.GuardBalances(1,{cash=110,bank=20},'character'))
assert(not exported.GuardBalances(1,{cash=111,bank=20},'character'))
assert(not exported.GuardBalances(1,{cash=10,bank=20},'other-character'))
settings['Money gain limit']=0;settings['Money gain budget']=100;settings['Money gain window seconds']=60;replaceConfig()
assert(exported.GuardBalances(1,{cash=70,bank=20},'character'))
assert(exported.GuardBalances(1,{cash=70,bank=20},'character'),'uncommitted attempts consume nothing')
assert(exported.TrackBalances(1,{cash=70,bank=20},'character'))
assert(not exported.GuardBalances(1,{cash=111,bank=20},'character'),'split positive gains share budget')
assert(exported.GuardBalances(1,{cash=110,bank=20},'character'))
assert(exported.TrackBalances(1,{cash=110,bank=20},'character'))
assert(exported.GuardBalances(1,{cash=10,bank=120},'character'),'atomic internal transfer net zero')
assert(exported.TrackBalances(1,{cash=10,bank=120},'character'))
assert(exported.GuardBalances(1,{cash=0,bank=120},'character'))
assert(exported.TrackBalances(1,{cash=0,bank=120},'character'))
assert(not exported.GuardBalances(1,{cash=1,bank=120},'character'),'deduction cannot refund positive budget')
invoking='other-economy';assert(exported.TrackBalances(1,{cash=0},'character'))
assert(not exported.GuardBalances(1,{cash=1},'character'),'same identity shares budget across resource callers')
assert(exported.TrackBalances(1,{cash=0},'second-character'))
assert(exported.GuardBalances(1,{cash=100},'second-character'),'character identities isolated')
invoking='independent-resource';clock=clock+59999
assert(not exported.GuardBalances(1,{cash=1,bank=120},'character'))
clock=clock+1;assert(exported.GuardBalances(1,{cash=100,bank=120},'character'),'rolling window expires')
mode='monitor';assert(exported.GuardBalances(1,{cash=101,bank=120},'character'))
assert(exported.TrackBalances(1,{cash=101,bank=120},'character'));mode='protect'
assert(not exported.GuardBalances(1,{cash=102,bank=120},'character'),'monitor commits still consume budget')
settings['Money trusted resources']={'payout'};replaceConfig()
assert(not exported.GuardBalances(1,{cash=102,bank=120},'character','payout'),'untrusted resource cannot attribute exemption')
invoking='payout';assert(exported.TrackBalances(1,{cash=0},'character'))
assert(exported.GuardBalances(1,{cash=1000},'character'));assert(exported.TrackBalances(1,{cash=1000},'character'))
invoking='independent-resource';clock=clock+60000
assert(exported.GuardBalances(1,{cash=201,bank=120},'character'),'trusted payout does not consume budget')
settings['Money gain budget']=0;replaceConfig()
assert(not exported.GuardInventory(1,'stash:one'))
assert(exported.AuthorizeInventory(1,'stash:one',1));assert(not exported.GuardInventory(1,'stash:two'))
assert(exported.GuardInventory(1,'stash:one'));assert(not exported.GuardInventory(1,'stash:one'))
assert(exported.AuthorizeInventory(1,'stash:one',1));clock=clock+1000;assert(not exported.GuardInventory(1,'stash:one'))
invoking=nil;assert(not exported.TrackBalances(1,{cash=1},'character'));assert(not exported.AuthorizeInventory(1,'stash:one',1))
''')
load(lua, ['shared/rules.lua', 'shared/selfcheck.lua'])
print(lua.globals().AxiomSelfcheck())
print('PASS: server entity/explosion/particle exemptions, event guard, money precommit, inventory target/expiry/resource isolation')

client = LuaRuntime(unpack_returned_tuples=True)
client.execute('''
threads={};handlers={};signals={};clock=100000;source=65535;health=999;armour=200;visible=false;alpha=0;ammo=999;owned=true
function CreateThread(fn)threads[#threads+1]=fn end
function RegisterNetEvent(name,fn)handlers[name]=fn end
function AddEventHandler(name,fn)handlers[name]=fn end
function GetHashKey(s)local h=0;for i=1,#s do h=(h*31+s:lower():byte(i))&0xffffffff end return h end
function GetGameTimer()return clock end
function TriggerServerEvent(name,rule,evidence)if name=='axiom_guard:signal'then signals[rule]=evidence end end
function RegisterNUICallback()end
function SetNuiFocus()end
function SetNuiFocusKeepInput()end
function SendNUIMessage()end
function PlayerPedId()return 1 end
function PlayerId()return 0 end
function DoesEntityExist()return true end
function IsEntityDead()return false end
function IsPlayerControlOn()return true end
function IsScreenFadedIn()return true end
function IsPauseMenuActive()return false end
function IsPlayerSwitchInProgress()return false end
function IsCutsceneActive()return false end
function GetWeapontypeGroup()return GetHashKey('GROUP_SHOTGUN')end
function GetEntityHealth()return health end
function SetEntityHealth(_,value)health=value end
function GetPedArmour()return armour end
function SetPedArmour(_,value)armour=value end
function IsEntityVisible()return visible end
function GetEntityAlpha()return alpha end
function SetEntityVisible(_,value)visible=value end
function ResetEntityAlpha()alpha=255 end
function IsWeaponValid()return true end
function GetSelectedPedWeapon()return GetHashKey('WEAPON_PISTOL')end
function HasPedGotWeapon(_,weapon)return owned and weapon==GetHashKey('WEAPON_PISTOL')end
function RemoveWeaponFromPed()owned=false end
function GetAmmoInPedWeapon()return ammo end
function SetPedAmmo(_,_,value)ammo=value end
function GetRegisteredCommands()return {{name='badcommand'}}end
function GetNumResources()return 0 end
function HasStreamedTextureDictLoaded()return false end
''')
load(client, modules['client'])
client.execute('''
local cfg={['Player max health']=200,['Player max armour']=100,['Anti invisible']=true,['Blacklisted weapons']={'WEAPON_PISTOL'},['Client max ammo']=250,['Blacklisted commands']={'badcommand'},['Infinite ammo weapon whitelist']={}}
local policy={mode='protect',ttlMs=45000,exempt=false,rules={}}
for key in pairs(cfg)do policy.rules[key]={enabled=true,action='cancel'}end
handlers['axiom_guard:fullConfig'](cfg,1,policy)
AxiomClient.signal('Player max health',{health=health});assert(health==200 and signals['Player max health'].health==999)
health=500;AxiomClient.signal('Player max health',{health=health});assert(health==200,'cooldown must not disable mitigation')
AxiomClient.signal('Player max armour',{armour=armour});assert(armour==100)
AxiomClient.signal('Anti invisible',{alpha=alpha});assert(visible and alpha==255)
AxiomClient.signal('Client max ammo',{weapon=GetHashKey('WEAPON_PISTOL'),ammo=ammo});assert(ammo==250)
AxiomClient.signal('Blacklisted weapons',{weapon=GetHashKey('WEAPON_PISTOL')});assert(not owned)
health=500;policy.mode='monitor';handlers['axiom_guard:fullConfig'](nil,1,policy);AxiomClient.signal('Player max health',{});assert(health==500)
policy.mode='protect';policy.exempt=true;handlers['axiom_guard:fullConfig'](nil,1,policy);AxiomClient.signal('Player max health',{});assert(health==500)
policy.exempt=false;policy.rules['Player max health'].enabled=false;handlers['axiom_guard:fullConfig'](nil,1,policy);AxiomClient.signal('Player max health',{});assert(health==500)
policy.rules['Player max health'].enabled=true;handlers['axiom_guard:fullConfig'](nil,1,policy);clock=clock+45000;AxiomClient.signal('Player max health',{});assert(health==500,'lease boundary')
source=0;handlers['axiom_guard:fullConfig'](nil,1,policy);AxiomClient.signal('Player max health',{});assert(health==500,'local injection rejected')
source=65535;handlers['axiom_guard:fullConfig'](nil,1,policy);AxiomClient.signal('Player max health',{});assert(health==200,'equal revision renews lease')
cfg['Player max health']=false;handlers['axiom_guard:fullConfig'](cfg,2,policy);health=500;AxiomClient.signal('Player max health',{});assert(health==500,'config disable wins')
''')
print('PASS: client real module mitigation state transitions, evidence-before-change, repeated restoration, monitor/exempt/disabled/stale/source gates')
