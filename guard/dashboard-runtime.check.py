# Python3 + lupa.lua54: real native ticket issuance and client focus lifecycle.
from pathlib import Path
import json
from lupa.lua54 import LuaRuntime, lua_type
root=Path(__file__).parent/'resource/axiom_guard'
server=LuaRuntime(unpack_returned_tuples=True)
def plain(value):
    if lua_type(value)!='table': return value
    return {key:plain(item) for key,item in value.items()}
def table(value):
    if isinstance(value,dict):return server.table_from({key:table(item) for key,item in value.items()})
    return value
server.globals().json=server.table_from({'encode':lambda value:json.dumps(plain(value)),'decode':lambda value:table(json.loads(value))})
server.execute('''
commands={};messages={};aces={};handlers={};timers={};requests={};clock=10000;identifiers={'license:abc'};config={['Admin identifier list']={}};url='https://axiomcreative.xyz/anticheat/'
identity={playerId=1,playerName='Admin',playerSession='player-session',serverSession='server-session',license='license:abc'}
ticket=string.rep('T',43)
function RegisterCommand(name,fn)commands[name]=fn end
function TriggerClientEvent(name,id,value,credential)messages[#messages+1]={name=name,id=id,value=value,ticket=credential}end
function IsPlayerAceAllowed(id,key)return aces[key]==true end
function GetPlayerIdentifiers()return identifiers end
function GetGameTimer()return clock end
function GetConvar(name,fallback)if name=='axiom_guard_dashboard_url'then return url elseif name=='axiom_guard_token'then return 'server-only-token'else return fallback end end
function AddEventHandler(name,fn)handlers[name]=fn end
function SetTimeout(_,fn)timers[#timers+1]=fn end
function PerformHttpRequest(address,callback,method,body,headers,options)requests[#requests+1]={url=address,callback=callback,body=body};assert(headers.Authorization=='Bearer server-only-token' and options.followLocation==false)end
function print()end
AxiomBackend={configSnapshot=function()return{fullConfig={values=config}}end}
AxiomFullServer={dashboardIdentity=function()return identity end}
function command()clock=clock+2001;commands.axiomguard(1)end
function answer(index)requests[index].callback(200,json.encode({ticket=ticket,expires=30000}))end
''')
server.execute((root/'server/dashboard.lua').read_text())
server.execute('''
command();assert(#requests==0 and messages[#messages].name=='axiom_guard:commandResult','nonadmin denied')
aces['axiom_guard.dashboard']=true;command();assert(#requests==1 and requests[1].url=='http://127.0.0.1:3013/anticheat/api/nui-ticket')
command();assert(#requests==1,'pending issuance bounded')
answer(1);assert(messages[#messages].name=='axiom_guard:dashboardOpen' and messages[#messages].ticket==ticket)
command();local request=#requests;aces={};answer(request);assert(requests[#requests].url:match('/api/nui%-revoke$'),'permission rechecked before delivery')
aces['axiom_guard.dashboard']=true;command();request=#requests;source=1;handlers.playerDropped();identity=nil;answer(request);assert(requests[#requests].url:match('/api/nui%-revoke$'),'late disconnect response revoked')
identity={playerId=1,playerName='Admin',playerSession='new-session',serverSession='server-session',license='license:abc'}
for _,bad in ipairs({'http://localhost/anticheat/','https://user:password@example.com/','https://example.com/../api','https://example.com/api?token=x','https://example.com/api#secret','https://example.com:99999/api','https://example.com//api'})do
 url=bad;local before=#requests;command();assert(#requests==before,'invalid URL never gets credential')end
url='https://example.com/anticheat';aces={};config['Admin identifier list']={'license:abc'};command();answer(#requests);assert(messages[#messages].value=='https://example.com/anticheat/')
local count=#messages;commands.axiomguard(0);assert(#messages==count,'console cannot broadcast access')
''')
client=LuaRuntime(unpack_returned_tuples=True)
client.execute('''
handlers={};callbacks={};messages={};timers={};focus={};source=0;ticket=string.rep('T',43);clock=1000
function RegisterNetEvent(name,fn)handlers[name]=fn end
function RegisterNUICallback(name,fn)callbacks[name]=fn end
function AddEventHandler(name,fn)handlers[name]=fn end
function SetNuiFocus(keyboard,mouse)focus={keyboard,mouse}end
function SetNuiFocusKeepInput(value)kept=value end
function SendNUIMessage(message)messages[#messages+1]=message end
function GetCurrentResourceName()return 'axiom_guard'end
function GetGameTimer()return clock end
function SetTimeout(_,fn)timers[#timers+1]=fn end
function print()end
''')
client.execute((root/'client/dashboard.lua').read_text())
client.execute('''
assert(not focus[1] and not focus[2] and kept==false)
handlers['axiom_guard:dashboardOpen']('https://example.com/anticheat/',ticket);assert(#messages==0,'local event denied')
source=65535;handlers['axiom_guard:dashboardOpen']('https://example.com/anticheat/','bad');assert(#messages==0)
handlers['axiom_guard:dashboardOpen']('https://example.com/anticheat/',ticket);assert(#messages==0,'await ready')
local replies=0;callbacks.dashboardReady({},function(v)assert(v.ok);replies=replies+1 end)
assert(replies==1 and focus[1] and focus[2] and messages[1].ticket==ticket)
handlers['axiom_guard:dashboardOpen']('https://other.invalid/',ticket);assert(#messages==1,'duplicate open ignored')
callbacks.dashboardClose({},function(v)assert(v.ok);replies=replies+1 end);assert(replies==2 and not focus[1] and not focus[2])
handlers['axiom_guard:dashboardOpen']('https://example.com/anticheat/',ticket);assert(focus[1])
handlers.onClientResourceStop('axiom_guard');assert(not focus[1] and not focus[2])
''')
print('PASS: native administrator issuance, permission/session rechecks, disconnect revoke, URL validation; client source/ticket/ready/close gates')
