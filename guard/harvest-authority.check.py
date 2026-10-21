from pathlib import Path
import re
from lupa.lua54 import LuaRuntime

root = Path(__file__).parent.parent / 'city/[jobs]/ax_nonwhitelist'
lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute('''
now=0; source=1; callbacks={}; events={}; clients={}; bags={[1]={},[2]={}}; buckets={[1]=0,[2]=0}; xp=0
local vmt={}
vmt.__sub=function(a,b)return vector3(a.x-b.x,a.y-b.y,a.z-b.z)end
vmt.__len=function(a)return math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z)end
function vector3(x,y,z)return setmetatable({x=x,y=y,z=z},vmt)end
function vector4(x,y,z,w)local v=vector3(x,y,z);v.w=w;return v end
vec3=vector3;vec4=vector4
positions={[1]=vector3(0,0,0),[2]=vector3(0,0,0)}
players={}
for id=1,2 do players[id]={PlayerData={citizenid='citizen'..id,job={name='unemployed'}}} end
function GetGameTimer()return now end
function GetPlayerPed(id)return players[id] and id or 0 end
function GetEntityHealth()return 200 end
function GetEntityCoords(id)return positions[id]end
function GetPlayerRoutingBucket(id)return buckets[id]end
function GetPlayers()return {'1','2'}end
function TriggerClientEvent(event,target,...)clients[#clients+1]={event=event,target=target,args={...}}end
function RegisterNetEvent(event,fn)if fn then events[event]=fn end end
RegisterServerEvent=RegisterNetEvent
function AddEventHandler(event,fn)events[event]=fn end
function fire(event,id,...)source=id;if events[event]then return events[event](...)end end
function call(event,id,...)return callbacks[event](id,...)end
lib={callback={register=function(event,fn)callbacks[event]=fn end}}
local inventory={}
function inventory:GetItemCount(id,item)return bags[id][item]or 0 end
function inventory:CanCarryItem()return true end
function inventory:RemoveItem(id,item,count)
 if failRemove==item or self:GetItemCount(id,item)<count then return false end
 bags[id][item]=self:GetItemCount(id,item)-count;return true
end
function inventory:AddItem(id,item,count)
 if failAdd==item then return false end
 bags[id][item]=self:GetItemCount(id,item)+count;return true
end
exports={ox_inventory=inventory,['qb-core']={GetCoreObject=function()return {Functions={GetPlayer=function(id)return players[id]end}}end},
 ['ax_misc']={AddXP=function(_,id,skill,amount)xp=xp+amount end}}
''')
lua.execute((root / 'farming/cfg_farming.lua').read_text())
lua.execute((root / 'farming/server/sv_farming.lua').read_text())
lua.execute('''
positions[1]=vector3(1754.1060,-1649.1702,112.6552);bags[1].money=1000
for _,count in ipairs({0,-1,1.5,math.huge,0/0,101})do fire('beliSingkong:server:beli',1,'seed_singkong',count)end
fire('beliSingkong:server:beli',1,'weapon_rpg',1)
assert(bags[1].money==1000 and not bags[1].weapon_rpg,'invalid catalog/count cannot buy')
failRemove='money';fire('beliSingkong:server:beli',1,'seed_singkong',1);assert(not bags[1].seed_singkong,'failed debit cannot mint seeds');failRemove=nil
failAdd='seed_singkong';fire('beliSingkong:server:beli',1,'seed_singkong',1);assert(bags[1].money==1000,'failed delivery refunds debit');failAdd=nil
fire('beliSingkong:server:beli',1,'seed_singkong',2);assert(bags[1].money==600 and bags[1].seed_singkong==2)
positions[1]=vector3(0,0,0);fire('beliSingkong:server:beli',1,'seed_singkong',1);assert(bags[1].money==600,'remote purchase rejected')
fire('ax_nonwhitelist:harvest',1,123,'seed_singkong');assert(not bags[1].singkong,'forged plant cannot reward')
positions[1]=vector3(3107.0276,1994.2515,13.5129);positions[2]=positions[1]
assert(call('ax_nonwhitelist:beginPlant',1,'seed_singkong'));assert(not call('ax_nonwhitelist:plantSeed',1),'early plant rejected')
assert(bags[1].seed_singkong==2)
assert(call('ax_nonwhitelist:beginPlant',1,'seed_singkong'));now=5000
local id=call('ax_nonwhitelist:plantSeed',1);assert(type(id)=='number' and bags[1].seed_singkong==1)
assert(not call('ax_nonwhitelist:beginHarvest',1,id),'immature rejected')
now=10000;assert(not call('ax_nonwhitelist:beginHarvest',2,id),'other owner rejected')
buckets[1]=1;assert(not call('ax_nonwhitelist:beginHarvest',1,id),'bucket rejected');buckets[1]=0
assert(call('ax_nonwhitelist:beginHarvest',1,id));now=15000
failAdd='singkong';fire('ax_nonwhitelist:harvest',1,id);assert(not bags[1].singkong,'failed output retains plant');failAdd=nil
assert(call('ax_nonwhitelist:beginHarvest',1,id));now=20000;fire('ax_nonwhitelist:harvest',1,id)
local reward=bags[1].singkong;assert(reward>=2 and reward<=4)
fire('ax_nonwhitelist:harvest',1,id);assert(bags[1].singkong==reward and not call('ax_nonwhitelist:beginHarvest',1,id),'harvest consumed once')
positions[1]=vector3(-2092.5586,7137.5454,28.8732);bags[1].wheat=20;bags[1].karung=2
fire('farming:giveRice',1);assert(bags[1].wheat==20,'direct processing denied')
assert(call('farming:checkRice',1));now=26000;failRemove='karung';fire('farming:giveRice',1);failRemove=nil
assert(bags[1].wheat==20 and bags[1].karung==2 and not bags[1].ricesack,'partial debit refunded')
assert(call('farming:checkRice',1));now=32000;fire('farming:giveRice',1)
assert(bags[1].ricesack==1 and bags[1].wheat==0 and bags[1].karung==0)
''')
lua.execute(re.sub(r'`[^`]+`', '0', (root / 'kumpulan/cfg_kumpulan.lua').read_text()))
lua.execute((root / 'kumpulan/server/server.lua').read_text())
lua.execute('''
local before=xp;fire('db_steal:server:TryGiveItems',1);assert(xp==before,'naked hacking denied')
positions[1]=vector3(1098.1753,-1288.3422,21.0969)
assert(call('db_steal:server:Begin',1,'db_steal_1'));fire('db_steal:server:TryGiveItems',1);assert(xp==before,'early hacking denied')
assert(not call('db_steal:server:Begin',1,'db_steal_1'),'cooldown survives early finish')
assert(call('db_steal:server:Begin',1,'db_steal_2')==false,'different station remote denied')
assert(call('db_steal:server:Begin',1,'db_steal_4')==false)
now=152000;assert(call('db_steal:server:Begin',1,'db_steal_1'));now=158000
local n=#clients;fire('db_steal:server:ElectricShock',1,2,{x=999,y=999,z=999})
assert(#clients==n+2)
for i=n+1,#clients do assert(clients[i].args[1]==1 and clients[i].args[2].x==positions[1].x,'shock derives sender and own position')end
fire('db_steal:server:ElectricShock',1,2,{});assert(#clients==n+2,'one shock per task')
now=162000;fire('db_steal:server:TryGiveItems',1);assert(xp>before,'authorized timed task awards XP')
local awarded=xp;fire('db_steal:server:TryGiveItems',1);assert(xp==awarded,'hacking replay denied')
now=272000;players[1].PlayerData.job.name='police';assert(not call('db_steal:server:Begin',1,'db_steal_1'),'restricted job denied')
''')
print('PASS: farming catalog/debits/rollback, timed owner-bound planting/harvest, processing rollback; hacking location/time/cooldown/replay and sender-only shock')
