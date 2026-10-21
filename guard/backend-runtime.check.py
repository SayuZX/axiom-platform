# Python3 + lupa.lua54: actual Lua backend/runtime, isolated native storage and event host.
from pathlib import Path
import json
import re
from lupa.lua54 import LuaRuntime, lua_type

root = Path(__file__).parent / 'resource/axiom_guard'
manifest = (root / 'fxmanifest.lua').read_text()
modules = re.findall(r"'([^']+\.lua)'", re.search(r'server_scripts\s*\{(.*?)\}', manifest, re.S)[1])
files = {}
clock_epoch = 1791201600

def runtime():
    lua = LuaRuntime(unpack_returned_tuples=True)
    def table(value):
        if isinstance(value, dict): return lua.table_from({key: table(item) for key, item in value.items() if item is not None})
        if isinstance(value, list): return lua.table_from([table(item) for item in value])
        return value
    def plain(value):
        if lua_type(value) != 'table': return value
        entries = {key: plain(item) for key, item in value.items()}
        if entries and set(entries) == set(range(1, len(entries) + 1)): return [entries[i] for i in range(1, len(entries) + 1)]
        return entries
    def load_file(resource, name):
        if name in files: return files[name]
        if name == 'server/bootstrap.json': return None
        path = root / name
        return path.read_text() if path.exists() else None
    def save_file(resource, name, body, length):
        if lua.globals().failWrite: return False
        files[name] = body
        return True
    lua.globals().json = lua.table_from({'encode': lambda value: json.dumps(plain(value), ensure_ascii=False), 'decode': lambda value: table(json.loads(value))})
    lua.globals().LoadResourceFile = load_file
    lua.globals().SaveResourceFile = save_file
    lua.execute('''
clock=1000;failWrite=false;source=1;handlers={};threads={};timers={};commands={};drops={};messages={};cancelled=0;invoking='integration';modeNative={}
function GetCurrentResourceName()return 'axiom_guard'end
function GetGameTimer()return clock end
function GetConvar(_,fallback)return fallback end
function SetConvar(key,value)modeNative[key]=value end
function GetResourceState(name)return name=='axiom_guard' and 'started' or 'missing'end
function GetInvokingResource()return invoking end
function GetPlayers()return {'1'}end
function GetPlayerName(id)return tonumber(id)==1 and 'Lua Player' or nil end
function GetPlayerIdentifiers()return {'license:abc','discord:100000000000000000','ip:8.8.8.8'}end
function GetPlayerPed()return 100 end
function GetPlayerPing()return 20 end
function DoesEntityExist(e)return e~=0 end
function GetEntityCoords(e)return {x=1,y=2,z=3}end
function GetEntityHealth()return 200 end
function GetPedArmour()return 100 end
function GetEntityType(e)return e==100 and 1 or 2 end
function GetEntityModel(e)return GetHashKey(e==100 and 'player_zero' or 'tug')end
function GetEntityPopulationType()return 7 end
function NetworkGetEntityOwner()return 1 end
function NetworkGetFirstEntityOwner()return 1 end
function GetEntityScript()return 'test-resource'end
function IsPedAPlayer(e)return e==100 end
function GetHashKey(s)local h=0;for i=1,#s do h=(h*31+s:lower():byte(i))&0xffffffff end return h end
function IsPlayerAceAllowed()return false end
function GetNumResources()return 1 end
function GetResourceByFindIndex()return 'axiom_guard'end
function GetResourcePath()return '/isolated/axiom_guard'end
function GetNumResourceMetadata()return 0 end
function GetResourceMetadata()return nil end
function SetHttpHandler()end
function AddEventHandler(name,fn)handlers[name]=handlers[name]or{};table.insert(handlers[name],fn);return fn end
function RegisterNetEvent(name,fn)if fn then AddEventHandler(name,fn)end end
function RemoveEventHandler()end
function RegisterCommand(name,fn)commands[name]=fn end
function CreateThread(fn)threads[#threads+1]=coroutine.create(fn)end
function Wait()coroutine.yield()end
function SetTimeout(ms,fn)timers[#timers+1]={at=clock+ms,fn=fn}end
function TriggerClientEvent(name,id,...)messages[#messages+1]={name=name,id=id,args={...}}end
function CancelEvent()cancelled=cancelled+1 end
function DropPlayer(id,reason)drops[#drops+1]={id=id,reason=reason}end
function PerformHttpRequest()error('No HTTP permitted in standalone gameplay smoke')end
function fire(name,...)for _,fn in ipairs(handlers[name]or{})do fn(...)end end
function step(ms)
 clock=clock+(ms or 1000)
 for _,thread in ipairs(threads)do if coroutine.status(thread)~='dead'then local ok,err=coroutine.resume(thread);assert(ok,err)end end
end
local exported={}
exports=setmetatable({}, {__call=function(_,name,fn)exported[name]=fn end,__index=function(_,name)return setmetatable({}, {__index=function(_,method)return function(_,...)return exported[method](...)end end})end})
''')
    for path in modules: lua.execute((root / path).read_text(), name=path)
    return lua

lua = runtime()
lua.execute('''
assert(AxiomBackend.setMode('protect'))
assert(AxiomBackend.saveConfig({['Required identifier types']={'license'},['Discord account min age (days)']=0,['Admins bypass anti-cheat']=false}))
step();assert(AxiomFullServer.getMode()=='protect')
fire('entityCreating',200);assert(cancelled>0,'real engine event cancelled under protect')
local count=cancelled;assert(AxiomBackend.setMode('monitor'));step();fire('entityCreating',200);assert(cancelled==count,'monitor no cancellation')
assert(AxiomBackend.saveConfig({['Detection settings']={['Anti god mode']={enabled=true,action='ban'}}}));assert(AxiomBackend.setMode('protect'));step()
local snapshot=AxiomBackend.snapshot();local rev=snapshot.fullConfig.revision
fire('axiom_guard:signal','Anti god mode',{revision=rev,kind='native_unavailable'});assert(#drops==0,'diagnostics never ban')
clock=clock+11000
failWrite=true;fire('axiom_guard:signal','Anti god mode',{revision=rev,kind='player_invincible'});assert(#drops==0,'failed persistence never disconnects as banned')
failWrite=false;clock=clock+11000;fire('axiom_guard:signal','Anti god mode',{revision=rev,kind='player_invincible'});assert(#drops==1 and drops[1].id==1,'only reporting session drops after durable ban')
assert(#AxiomBackend.banSnapshot().bans==1)
local decision;AxiomBackend.admit({'license:abc'},function(v)decision=v end,2);assert(decision.allowed==false,'banned identity denied')
local stale={config=AxiomRules.config(AxiomRules.defaults),fullConfig={revision=1,values=AxiomBackend.copy(snapshot.fullConfig.values)},protection=AxiomBackend.copy(snapshot.protection),bans={bans={},whitelist={}}}
assert(AxiomBackend.acceptDashboard(stale));assert(AxiomBackend.setMode('protect'));assert(AxiomBackend.acceptDashboard(stale));assert(AxiomBackend.snapshot().config.mode=='protect','repeated dashboard state cannot roll back console')
assert(#AxiomBackend.banSnapshot().bans==1,'dashboard cannot discard local ban')
assert(AxiomBackend.flushHistory())
''')
restart = runtime()
restart.execute('''
assert(AxiomBackend.snapshot().config.mode=='protect','config survives restart without Node')
local bans=AxiomBackend.banSnapshot().bans;assert(#bans==1 and bans[1].id=='lua-1','ban survives restart')
assert(AxiomBackend.acceptBans({bans={},whitelist={},luaRevocations={'lua-1'}}));assert(#AxiomBackend.banSnapshot().bans==0,'dashboard explicit revocation persists')
local result;AxiomBackend.admit({'license:abc'},function(v)result=v end,2);assert(result.allowed)
assert(AxiomBackend.saveConfig({['Money gain limit']=100,['Player money tracking']=true,['Anti open inventory']=true}))
step();function GetResourceState()return 'started'end
assert(exports.axiom_guard:TrackBalances(1,{cash=0,bank=50},'character'))
assert(not exports.axiom_guard:GuardBalances(1,{cash=101,bank=50},'character'),'standalone money precommit rejects')
assert(exports.axiom_guard:GuardBalances(1,{cash=100,bank=50},'character'))
assert(not exports.axiom_guard:GuardInventory(1,'stash:one'));assert(exports.axiom_guard:AuthorizeInventory(1,'stash:one',1));assert(exports.axiom_guard:GuardInventory(1,'stash:one'))
''')
print('PASS: whole Lua server loads; native event cancel/monitor; sender-bound ban; storage failure; restart persistence; local admission; dashboard revision/revocation; standalone money/inventory')
