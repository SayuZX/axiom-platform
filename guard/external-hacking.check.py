from pathlib import Path
from lupa.lua54 import LuaRuntime

root = Path(__file__).resolve().parent.parent
lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute(r'''
callbacks, events, commands, timers, sent, awards = {}, {}, {}, {}, {}, {}
now, allowed, admin, duty, inserts, updates = 0, true, false, 0, 0, 0
local vec = {}
vec.__sub = function(a,b) return vector3(a.x-b.x,a.y-b.y,a.z-b.z) end
vec.__len = function(a) return math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z) end
function vector3(x,y,z) return setmetatable({x=x,y=y,z=z}, vec) end
players = {}
for i=1,3 do players[i]={PlayerData={metadata={isdead=false,inlaststand=false}},Functions={}} end
positions = {[1]=vector3(0,0,0),[2]=vector3(0,0,0),[3]=vector3(0,0,0),[20]=vector3(10,0,0)}
buckets = {[1]=0,[2]=0,[3]=0,[20]=0}
local qb = {Functions={},Commands={}}
qb.Functions.GetPlayer=function(id) return players[id] end
qb.Functions.HasPermission=function() return admin end
qb.Functions.GetDutyCount=function() return duty end
qb.Functions.Notify=function() end
qb.Commands.Add=function(name,_,_,_,fn) commands[name]=fn end
exports={['qb-core']={GetCoreObject=function() return qb end},ax_perks={HasPerk=function() return allowed end},
 ax_misc={AddXP=function(_,src,skill,amount) awards[#awards+1]={src,skill,amount} end},
 ax_whitelist={RevivePlayer=function(_,src) players[src].PlayerData.metadata.isdead=false;return true end}}
lib={callback={register=function(name,fn) callbacks[name]=fn end}}
function RegisterNetEvent(name,fn) events[name]=fn end
function AddEventHandler(name,fn)
 local old=events[name]
 events[name]=function(...) if old then old(...) end;fn(...) end
end
function TriggerClientEvent(name,target,...) sent[#sent+1]={name,target,...} end
function GetGameTimer() return now end
function GetPlayerPed(src) return players[src] and src or 0 end
function GetEntityHealth() return 200 end
function GetPlayerRoutingBucket(src) return buckets[src] end
function GetEntityRoutingBucket(entity) return buckets[entity] end
function GetEntityCoords(entity) return positions[entity] end
function GetEntityHeading() return 90 end
function GetPlayers() return {'1','2','3'} end
function GetHashKey(name) return ({prop_elecbox_01a=101,prop_elecbox_04a=102,prop_elecbox_09=103,prop_elecbox_07a=104,prop_elecbox_05a=105})[name] end
function NetworkGetEntityFromNetworkId(id) return id==77 and 20 or 0 end
function NetworkGetEntityOwner() return 2 end
function DoesEntityExist(entity) return positions[entity]~=nil end
function GetEntityType(entity) return entity==20 and 2 or 1 end
function GetVehiclePedIsIn() return 0 end
function SetTimeout(_,fn) timers[#timers+1]=fn end
function CreateThread(fn) fn() end
json={decode=function(v)return v end,encode=function(v)return v end}
package.preload.config=function()return {BollardCount=6,BollardGap=1.5,DefaultState='closed',
 Notifications2={created='%s',opened='%s',closed='%s'}}end
MySQL={query={await=function()return {{id=1,positions={{x=0,y=0,z=0}},state='closed'}}end},
 insert=function(_,_,cb)inserts=inserts+1;cb(2)end,
 update={await=function()updates=updates+1;return 1 end}}
qb.Functions.CreateCallback=function()end
function call(name,...) return callbacks[name](1,...) end
''')
for relative in [
    'external/[misc]/ax_misc/server/sv_hacking.lua',
    'external/[misc]/ax_misc/server/sv_bollards.lua',
    'external/[misc]/ax-cctv/server/main.lua',
    'external/[misc]/ax_misc/server/sv_dokterlokal.lua',
]:
    path = root / relative
    lua.execute(path.read_text(), name=str(path))
lua.execute(r'''
local origin=vector3(1,0,0)
assert(not call('hack:requestTrigger'))
assert(not call('hack:begin',999,origin))
assert(not call('hack:begin',101,{x=0/0,y=0,z=0}))
allowed=false;assert(not call('hack:begin',101,origin));allowed=true
assert(not call('hack:begin',101,vector3(1000,0,0)))
assert(call('hack:begin',101,origin));assert(not call('hack:requestTrigger'))
now=20000;assert(call('hack:begin',101,origin));now=23000
assert(call('hack:requestTrigger'));assert(#awards==1 and awards[1][1]==1 and awards[1][2]=='hacking')
assert(not call('hack:requestTrigger'));assert(not call('hack:begin',101,origin))
now=40000;assert(call('hack:begin',102,origin));now=43000;buckets[1]=1
assert(not call('hack:requestTrigger'));buckets[1]=0;assert(#awards==1)

source=1;events['bollards:server:createBollards']({x=500,y=500,z=0},0);assert(inserts==0)
commands.createbollards(1);events['bollards:server:createBollards']({x=0,y=0,z=0},0);assert(inserts==0)
admin=true;commands.createbollards(1);events['bollards:server:createBollards']({x=500,y=500,z=999},0);assert(inserts==0)
commands.createbollards(1);events['bollards:server:createBollards']({x=500,y=500,z=0},0);assert(inserts==1)
local created=sent[#sent][4];assert(created[1].x<10 and created[1].y<10,'creation XY comes from server ped')
assert(not call('bollards:server:toggleState'))
allowed=false;assert(not call('bollards:server:beginToggle',1));allowed=true
positions[1]=vector3(1000,0,0);assert(not call('bollards:server:beginToggle',1));positions[1]=vector3(0,0,0)
assert(call('bollards:server:beginToggle',1));assert(not call('bollards:server:toggleState'));assert(updates==0)
now=60000;assert(call('bollards:server:beginToggle',1));now=60500
assert(call('bollards:server:toggleState'));assert(updates==1 and #awards==2)
assert(not call('bollards:server:toggleState'));assert(not call('bollards:server:beginToggle',1))

assert(not call('cctv:server:vehicleAction'))
assert(not call('cctv:server:beginVehicleAction',77,'explode'))
assert(not call('cctv:server:beginVehicleAction',999,'burst'))
allowed=false;assert(not call('cctv:server:beginVehicleAction',77,'burst'));allowed=true
buckets[20]=1;assert(not call('cctv:server:beginVehicleAction',77,'burst'));buckets[20]=0
assert(call('cctv:server:beginVehicleAction',77,'burst'));assert(not call('cctv:server:vehicleAction'))
now=80000;assert(call('cctv:server:beginVehicleAction',77,'burst'));now=83000
local n=#sent;assert(call('cctv:server:vehicleAction'));assert(#sent==n+1 and sent[#sent][2]==2)
assert(#awards==3 and awards[3][1]==1,'only actor receives XP, never vehicle owner or observers')
assert(not call('cctv:server:vehicleAction'))
now=100000;assert(call('cctv:server:beginVehicleAction',77,'gps'));now=103000
assert(call('cctv:server:vehicleAction'));assert(sent[#sent][2]==1 and #awards==4)
now=120000;assert(call('cctv:server:beginVehicleAction',77,'burst'));now=123000
positions[20]=vector3(1000,0,0);assert(not call('cctv:server:vehicleAction'));assert(#awards==4)

players[1].PlayerData.metadata.isdead=true
commands.dokterlokal(1);now=133000;duty=1;timers[#timers]();assert(players[1].PlayerData.metadata.isdead)
duty=0;commands.dokterlokal(1);now=143000;timers[#timers]();assert(not players[1].PlayerData.metadata.isdead)
players[1].PlayerData.metadata.isdead=true;commands.dokterlokal(1)
source=1;events.playerDropped();players[1]={PlayerData={metadata={isdead=true}},Functions={}}
now=153000;timers[#timers]();assert(players[1].PlayerData.metadata.isdead,'old doctor session cannot revive reused source')
''')
print('PASS: bounded timed actions; authority before mutation; owner-only physics; actor-only XP; session-safe doctor')
