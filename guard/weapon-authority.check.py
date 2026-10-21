from pathlib import Path
from lupa.lua54 import LuaRuntime
root=Path(__file__).parent/'resource/axiom_guard'
lua=LuaRuntime(unpack_returned_tuples=True)
lua.execute('''
clock=0;invoking='weapons';mode='protect';source=1;resource='ox_inventory';available=true;grants={};cancelled=0;exportsTable={};handlers={}
settings={['Server weapon authorization']=true,['Server weapon authorization resources']={'weapons'},['Server weapon authorization whitelist']={'WEAPON_UNARMED'},['Server weapon authorization vehicle whitelist']={},['Server weapon authorization indirect damage whitelist']={'WEAPON_EXPLOSION'},['Inventory integration']='ox_inventory',['Server vehicle request guard']=true,['Server vehicle request distance']=100,['Server vehicle request limit']=2,['Server vehicle request window']=15,['Entity list type']='Blacklist',['Entity list (blacklist/whitelist)']={'rhino'}}
function GetGameTimer()return clock end
function GetPlayerName(id)return id==1 and 'Player' end
function GetPlayers()return {'1'}end
function GetInvokingResource()return invoking end
function GetCurrentResourceName()return 'axiom_guard'end
function GetResourceState()return available and 'started' or 'stopped'end
function GetHashKey(v)local n=0;for i=1,#v do n=(n*31+v:lower():byte(i))&0xffffffff end;return n end
function GetPlayerPed()return 100 end
function DoesEntityExist()return true end
function GetEntityCoords(id)return {x=0,y=0,z=0}end
function GetVehiclePedIsIn()return 0 end
function GetEntityType()return 2 end
function GetEntityPopulationType()return 0 end
function NetworkGetFirstEntityOwner()return 1 end
function GetEntityModel()return GetHashKey('rhino')end
function AddEventHandler(name,fn)handlers[name]=fn end
exports=setmetatable({}, {__call=function(_,name,fn)exportsTable[name]=fn end,__index=function(_,name)return{
GetInventory=function()return inventory end,GetCurrentWeapon=function()return equipped end}end})
AxiomFullServer={getConfig=function()return settings end,getProtection=function()return{}end,allowed=function()return false end,report=function()end,action=function()return mode=='protect' and 'cancel' or 'monitor'end,enforce=function()return mode=='protect' and 'cancel' or 'monitor'end,cancel=function()if mode=='protect'then cancelled=cancelled+1;return true end;return false end}
AxiomIntegrations={selected=function(name)return settings['Inventory integration']==name end,resource=function()return resource end}
function resetConfig()local c={};for k,v in pairs(settings)do c[k]=v end;settings=c end
''')
for file in ['server/feature_core.lua','server/features/weapon_authorization.lua','server/features/entity_gate.lua']:
 lua.execute((root/file).read_text())
lua.execute('''
local S=AxiomServerFeatures;local pistol=GetHashKey('WEAPON_PISTOL')
inventory={id=1,player={},weapon=1,items={[1]={name='WEAPON_PISTOL',slot=1,count=1}}};equipped=inventory.items[1]
assert(S.weaponAuthorization(1,pistol,'weaponDamageEvent'))
assert(not S.weaponAuthorization(1,GetHashKey('WEAPON_RPG'),'weaponDamageEvent'))
inventory.items={};assert(not S.weaponAuthorization(1,pistol,'startProjectileEvent'))
assert(S.weaponAuthorization(1,GetHashKey('WEAPON_UNARMED'),'weaponDamageEvent'))
assert(S.weaponAuthorization(1,GetHashKey('WEAPON_EXPLOSION'),'weaponDamageEvent'))
available=false;assert(S.weaponAuthorization(1,pistol,'weaponDamageEvent'),'missing backend diagnostic, not accusation');available=true
settings['Inventory integration']='Standalone';resetConfig();assert(not S.weaponAuthorization(1,pistol,'weaponDamageEvent'))
assert(exportsTable.AuthorizeWeapon(1,pistol,1));assert(S.weaponAuthorization(1,pistol,'weaponDamageEvent'))
clock=1000;assert(not S.weaponAuthorization(1,pistol,'weaponDamageEvent'),'grant expiry')
invoking='cheat';assert(not exportsTable.AuthorizeWeapon(1,pistol,10));invoking='weapons'
assert(exportsTable.AuthorizeWeapon(1,pistol,10));handlers.onResourceStop('weapons');assert(not S.weaponAuthorization(1,pistol,'weaponDamageEvent'))
assert(S.validateVehicleRequest(1,'adder',{x=1,y=1,z=1}))
assert(not S.validateVehicleRequest(1,'rhino',{x=1,y=1,z=1}))
assert(not S.validateVehicleRequest(1,'adder',{x=1000,y=1,z=1}))
assert(not S.validateVehicleRequest(1,'adder',{x=0/0,y=1,z=1}))
assert(S.validateVehicleRequest(1,'adder',{x=1,y=1,z=1}));assert(not S.validateVehicleRequest(1,'adder',{x=1,y=1,z=1}),'request split-rate guard')
clock=17000;assert(S.validateVehicleRequest(1,'adder',{x=1,y=1,z=1}))
assert(S.entityGate(200,1),'population-zero blacklisted client entity')
mode='monitor';assert(not S.entityGate(200,1),'monitor never cancels')
''')
print('PASS: owned equipped inventory weapon, spoof/absent cancellation, standalone grant identity/TTL, vehicle model/distance/rate/NaN, population-zero blacklist')
