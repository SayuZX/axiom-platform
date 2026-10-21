from pathlib import Path
import re
from lupa.lua54 import LuaRuntime

root = Path(__file__).parent.parent / 'city/[jobs]/ax_nonwhitelist/kumpulan'
lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute('''
now=0; source=1; callbacks={}; events={}; handlers={}; threads={}; timers={}
bags={[1]={},[2]={}}; positions={}; health={[1]=200,[2]=200}; buckets={[1]=0,[2]=0}
models={}; existing={[1]=true,[2]=true}; xp=0; cash=0; nextPed=100; adds=0
local nativeType=type
local vmt={}
vmt.__sub=function(a,b)return vector3(a.x-b.x,a.y-b.y,a.z-b.z)end
vmt.__add=function(a,b)return vector3(a.x+b.x,a.y+b.y,a.z+b.z)end
vmt.__len=function(a)return math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z)end
function vector3(x,y,z)return setmetatable({x=x,y=y,z=z},vmt)end
function vector4(x,y,z,w)local v=vector3(x,y,z);v.w=w;return v end
vec3=vector3;vec4=vector4
function type(v)if nativeType(v)=='table' and getmetatable(v)==vmt then return 'vector3' end;return nativeType(v)end
positions[1]=vector3(0,0,0);positions[2]=positions[1]
function GetGameTimer()return now end
-- Keep player/entity identity distinct: a player is its own authoritative ped here.
function GetPlayerPed(id)if id==1 or id==2 then return id end return 0 end
function GetEntityHealth(id)return health[id] or 0 end
function GetEntityCoords(id)return positions[id]end
function GetPlayerRoutingBucket(id)return buckets[id]end
function GetEntityRoutingBucket(id)return buckets[id]end
function SetEntityRoutingBucket(id,bucket)buckets[id]=bucket end
function GetHashKey(name)return name=='WEAPON_MUSKET' and -123 or 456 end
function GetSelectedPedWeapon()return selectedWeapon or -123 end
function DoesEntityExist(id)return existing[id]or false end
function GetEntityModel(id)return models[id]end
function NetworkGetNetworkIdFromEntity(id)return id+1000 end
function CreatePed(_,model,x,y,z)
 nextPed=nextPed+1;lastLion=nextPed;existing[nextPed]=true;models[nextPed]=model
 positions[nextPed]=vector3(x,y,z);health[nextPed]=200;buckets[nextPed]=0;return nextPed
end
function DeleteEntity(id)existing[id]=nil end
function GetCurrentResourceName()return 'ax_nonwhitelist'end
function TriggerClientEvent()end
function RegisterNetEvent(name,fn)events[name]=fn end
function AddEventHandler(name,fn)handlers[name]=handlers[name]or{};table.insert(handlers[name],fn)end
function fire(name,id,...)source=id;if events[name]then return events[name](...)end end
function emit(name,...)for _,fn in ipairs(handlers[name]or{})do fn(...)end end
function call(name,id,...)return callbacks[name](id,...)end
function SetTimeout(delay,fn)table.insert(timers,{ready=now+delay,fn=fn})end
function Wait()coroutine.yield()end
function CreateThread(fn)local co=coroutine.create(fn);table.insert(threads,co);assert(coroutine.resume(co))end
function advance(ms)
 now=now+ms
 for i=#timers,1,-1 do if timers[i].ready<=now then local fn=timers[i].fn;table.remove(timers,i);fn()end end
 for _,co in ipairs(threads)do local ok,err=coroutine.resume(co);assert(ok,err)end
end
math.random=function(a,b)if trashMultiple and a==1 and b==3 then return 3 end;return a end
local inventory={}
function inventory:Search(id,_,item)return bags[id][item]or 0 end
function inventory:CanCarryItem()return true end
function inventory:RemoveItem(id,item,count)
 if failRemove==item or (bags[id][item]or 0)<count then return false end
 bags[id][item]=(bags[id][item]or 0)-count;return true
end
function inventory:AddItem(id,item,count)
 adds=adds+1
 if failAdd==item or failAddNth==adds then return false end
 bags[id][item]=(bags[id][item]or 0)+count;return true
end
local player={Functions={AddMoney=function(_,amount)if failMoney then return false end;cash=cash+amount;return true end}}
local core={Functions={GetPlayer=function(id)if id==1 or id==2 then return player end end,
 CreateCallback=function(name,fn)callbacks[name]=function(id,...)local result;fn(id,function(value)result=value end,...);return result end end}}
exports={ox_inventory=inventory,['qb-core']={GetCoreObject=function()return core end},
 ['ax_misc']={GetPlayerSkillLevel=function()return 1 end,AddXP=function(_,_,_,amount)xp=xp+amount end}}
lib={callback={register=function(name,fn)callbacks[name]=fn end}}
function count(item,id)return bags[id or 1][item]or 0 end
''')
lua.execute(re.sub(r'`[^`]+`', '0', (root / 'cfg_kumpulan.lua').read_text()))
for name in ['sv_ayam.lua', 'sv_farming.lua', 'sv_berburu.lua', 'sv_sampah.lua']:
    source = (root / 'server' / name).read_text()
    # Cfx compound assignment syntax, unchanged semantics under stock Lua54.
    source = re.sub(r'(\w+)\s*\+=\s*([^\n]+)', r'\1 = \1 + \2', source)
    lua.execute(source, name=name)
lua.execute('''
-- Chicken: naked/early/replay, wrong bucket, failed debit and second-output rollback.
positions[1]=Config_Kumpulan.Locations.takeChicken
fire('chicken:server:GiveTakenChicken',1);assert(count('alive_chicken')==0)
assert(call('chicken:server:BeginTaking',1));fire('chicken:server:GiveTakenChicken',1)
assert(count('alive_chicken')==0,'early chicken denied')
assert(call('chicken:server:BeginTaking',1));advance(5000);failAdd='eggs'
fire('chicken:server:GiveTakenChicken',1);failAdd=nil
assert(count('alive_chicken')==0 and xp==0,'egg delivery failure reverses chicken')
assert(call('chicken:server:BeginTaking',1));advance(5000);fire('chicken:server:GiveTakenChicken',1)
assert(count('alive_chicken')==1 and count('eggs')==1 and xp==3)
fire('chicken:server:GiveTakenChicken',1);assert(count('alive_chicken')==1 and xp==3,'chicken replay denied')
buckets[1]=4;assert(not call('chicken:server:BeginTaking',1));buckets[1]=0
positions[1]=vector3(-95.9501,6207.3037,31.0250)
assert(call('chicken:server:CanStartCutting',1));advance(5000);failRemove='alive_chicken'
fire('chicken:server:FinishCutting',1);failRemove=nil;assert(count('ayampotong')==0 and count('alive_chicken')==1)
assert(call('chicken:server:CanStartCutting',1));advance(5000);failAdd='buluayam'
fire('chicken:server:FinishCutting',1);failAdd=nil
assert(count('ayampotong')==0 and count('alive_chicken')==1,'failed second cut output restores input')
positions[1]=vector3(-104.0812,6206.7930,31.0250);bags[1].ayampotong=5
assert(call('ayam:server:BeginPaketAyam',1));advance(5000);failAdd='ayampaket'
fire('ayam:server:FinishPaketAyam',1);failAdd=nil
assert(count('ayampotong')==5 and count('ayampaket')==0,'packing failed delivery refunds input')
-- Fruit: catalog/station-bound, minimum time, replay, debit/payment rollback.
positions[1]=Config_Kumpulan.Fruits.apple.locations[1]
fire('farming:server:rewardFruit',1,'apple');assert(count('apple')==0)
assert(not call('farming:server:beginPick',1,'tomato',1));assert(not call('farming:server:beginPick',1,'apple',1.5))
assert(call('farming:server:beginPick',1,'apple',1));fire('farming:server:rewardFruit',1);assert(count('apple')==0)
assert(call('farming:server:beginPick',1,'apple',1));advance(2000);positions[1]=vector3(0,0,0)
fire('farming:server:rewardFruit',1);assert(count('apple')==0,'remote finish denied')
positions[1]=Config_Kumpulan.Fruits.apple.locations[1]
assert(call('farming:server:beginPick',1,'apple',1));advance(2000);fire('farming:server:rewardFruit',1,'mango')
assert(count('apple')==2 and count('mango')==0,'finish payload cannot change crop')
fire('farming:server:rewardFruit',1);assert(count('apple')==2)
positions[1]=vector3(4.5317,7405.9424,11.1309);failRemove='apple'
fire('farming:server:sellFruit',1,'apple');failRemove=nil;assert(cash==0 and count('apple')==2)
failMoney=true;fire('farming:server:sellFruit',1,'apple');failMoney=nil
assert(cash==0 and count('apple')==2,'failed payment restores sold crop')
fire('farming:server:sellFruit',1,'apple');assert(cash==38 and count('apple')==0)
-- Hunting: no spoof bait, actual debit, reservation, ownership, death and timed loot.
positions[1]=Config_Kumpulan.HuntingZone.coords;positions[2]=positions[1];bags[1][Config_Kumpulan.BaitItem]=2
assert(not call('qb-hunting:server:baitPlanted',1));assert(not lastLion)
assert(call('qb-hunting:server:beginBait',1));assert(not call('qb-hunting:server:baitPlanted',1))
assert(call('qb-hunting:server:beginBait',1));advance(Config_Kumpulan.PlantAnim.duration);failRemove=Config_Kumpulan.BaitItem
assert(not call('qb-hunting:server:baitPlanted',1));failRemove=nil;assert(not lastLion)
assert(call('qb-hunting:server:beginBait',1));advance(Config_Kumpulan.PlantAnim.duration)
assert(call('qb-hunting:server:baitPlanted',1));assert(not call('qb-hunting:server:baitPlanted',1));assert(not call('qb-hunting:server:beginBait',1))
advance(Config_Kumpulan.SpawnDelay);local lion=lastLion;local net=lion+1000
assert(count(Config_Kumpulan.BaitItem)==1 and existing[lion]);positions[1]=positions[lion];positions[2]=positions[lion]
assert(not call('qb-hunting:server:beginSkin',1,net),'live lion cannot loot')
fire('qb-hunting:server:lionDied',1,net,-123);fire('qb-hunting:server:giveMeat',1,net)
assert(count('lion_meat')==0 and health[lion]==200,'forged death event ineffective')
emit('weaponDamageEvent',1,{hitGlobalId=net,weaponType=4294967173});health[lion]=0;advance(1000)
assert(not call('qb-hunting:server:beginSkin',2,net),'other player cannot loot owned corpse')
assert(call('qb-hunting:server:beginSkin',1,net));fire('qb-hunting:server:giveMeat',1,net);assert(count('lion_meat')==0)
assert(call('qb-hunting:server:beginSkin',1,net));advance(Config_Kumpulan.SkinAnim.duration);failAdd='lion_skin'
fire('qb-hunting:server:giveMeat',1,net);failAdd=nil
assert(count('lion_meat')==0 and existing[lion],'partial hunting delivery reversed without losing corpse')
assert(call('qb-hunting:server:beginSkin',1,net));advance(Config_Kumpulan.SkinAnim.duration)
fire('qb-hunting:server:giveMeat',1,net);fire('qb-hunting:server:giveMeat',1,net)
assert(count('lion_meat')==1 and count('lion_skin')==1 and not existing[lion],'one corpse one payout')
-- Garbage: no naked/early/replay rewards; player cooldown survives invented coordinate rotation.
positions[1]=vector3(0,0,0);local direct=call('citytrash:server:search',1);assert(direct==false)
local duration=call('citytrash:server:checkCooldown',1,positions[1]);assert(duration==4500)
assert(call('citytrash:server:search',1)==false);assert(count('empty_bottles')==0)
duration=call('citytrash:server:checkCooldown',1,positions[1]);advance(duration)
local reward=call('citytrash:server:search',1);assert(type(reward)=='table' and count('empty_bottles')==1)
assert(call('citytrash:server:search',1)==false and count('empty_bottles')==1)
positions[1]=vector3(500,500,0);assert(not call('citytrash:server:checkCooldown',1,positions[1]),'rotated site cannot bypass player cooldown')
advance(Config_Kumpulan.Sampah.cooldownSeconds*1000);duration=call('citytrash:server:checkCooldown',1,positions[1]);advance(duration)
trashMultiple=true;failAddNth=adds+2
assert(call('citytrash:server:search',1)==false);failAddNth=nil;trashMultiple=nil
assert(count('empty_bottles')==1,'second garbage delivery failure reverses first addition')
''')
print('PASS: chicken/fruit session location time replay and debit rollback; hunting bait ownership live/dead evidence timed loot rollback; garbage timing replay site-rotation cooldown and partial reward rollback')
