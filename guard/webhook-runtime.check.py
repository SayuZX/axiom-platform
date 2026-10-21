# Python3 + lupa.lua54. Isolated native callback simulator; never contacts Discord.
from pathlib import Path
import json
from lupa.lua54 import LuaRuntime, lua_type

source = (Path(__file__).parent / 'resource/axiom_guard/server/webhook.lua').read_text()


def runtime():
    lua = LuaRuntime(unpack_returned_tuples=True)

    def plain(value):
        if lua_type(value) != 'table':
            return value
        entries = {key: plain(field) for key, field in value.items()}
        if entries and set(entries) == set(range(1, len(entries) + 1)):
            return [entries[index] for index in range(1, len(entries) + 1)]
        return entries

    def table(value):
        if isinstance(value, dict):
            return lua.table_from({key: table(field) for key, field in value.items()})
        if isinstance(value, list):
            return lua.table_from([table(field) for field in value])
        return value

    lua.globals().json = lua.table_from({
        'encode': lambda value: json.dumps(plain(value), ensure_ascii=False),
        'decode': lambda value: table(json.loads(value)),
    })
    lua.globals().moduleSource = source
    lua.execute('''
clock=1000000; requests={}; threads={}; commands={}; output={}; disk=nil; failSave=false; nativeFails=false
os.time=function() return math.floor(clock/1000) end
function GetGameTimer() return clock end
function GetConvar() return '' end
function GetInvokingResource() return invoking end
function RegisterCommand(name,fn) commands[name]=fn end
function print(value) output[#output+1]=value end
function Wait() coroutine.yield() end
function CreateThread(fn)
    local thread=coroutine.create(fn); threads[#threads+1]=thread
    local ok,err=coroutine.resume(thread); assert(ok,err)
end
function step(seconds)
    clock=clock+(seconds or 1)*1000
    for _,thread in ipairs(threads) do
        if coroutine.status(thread)~='dead' then local ok,err=coroutine.resume(thread); assert(ok,err) end
    end
end
function PerformHttpRequest(url,cb,method,body,headers,options)
    if nativeFails then error('native error containing secret credentials') end
    requests[#requests+1]={url=url,cb=cb,body=body,method=method,options=options}
end
AxiomBackend={
    loadStore=function(_,fallback) return disk and json.decode(disk) or fallback end,
    saveStore=function(_,value) if failSave then return nil,'write failure' end disk=json.encode(value); return true end
}
function reload() assert(load(moduleSource))() end
function event(key,kind)
    return {key=key,kind=kind or 'detection',playerId=7,playerName='Player @everyone',rule='rule',
        details={trust='SERVER OBSERVED',action='cancelled',playerSession='session:7',
            evidence={token='credential-secret',identifier='license:private',url='https://discord.com/api/webhooks/private',reason='ip:127.0.0.1 @everyone'}}}
end
server={name='Server',sessionId='session'}
url='https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789TOKEN'
url2='https://discord.com/api/webhooks/223456789012345678/abcdefghijklmnopqrstuvwxyz0123456789TOKEN'
function hooks(enabled)
    return {{id=1,name='First',url=url,eventKinds={'detection'},enabled=enabled~=false},
        {id=2,name='Second',url=url2,eventKinds={'connection','detection'},enabled=true}}
end
reload()
''')
    return lua


lua = runtime()
lua.execute('''
assert(not AxiomWebhook.enqueue(server,event('disabled')))
assert(AxiomWebhook.status().counters.delivered==0)
for _,bad in ipairs({'http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',url..'?x=1',url..'#x',
    url:gsub('discord.com','discord.com.evil'),url:gsub('discord.com','discord.com:443'),url:gsub('https://','https://user@')}) do
    assert(not AxiomWebhook.configure(bad),'reject noncanonical webhook endpoint')
end
commands.guard_webhook(7,{'set',url}); assert(not AxiomWebhook.status().configured,'player console denied')
invoking='untrusted'; commands.guard_webhook(0,{'set',url}); invoking=nil
assert(not AxiomWebhook.status().configured,'resource console denied')
assert(AxiomWebhook.configureMany(hooks()))
assert(AxiomWebhook.enqueue(server,event('fanout')))
assert(AxiomWebhook.status().queued==2,'all matching destinations queued')
assert(not AxiomWebhook.enqueue(server,event('fanout')))
assert(AxiomWebhook.status().counters.duplicates==2,'dedupe per destination')
step(); assert(#requests==1)
local payload=json.decode(requests[1].body)
assert(payload.allowed_mentions.parse[1]==nil,'mentions disabled')
assert(not requests[1].body:find('credential%-secret') and not requests[1].body:find('license:private'))
assert(not requests[1].body:find('@everyone') and not requests[1].body:find('127.0.0.1',1,true))
assert(requests[1].options.followLocation==false,'redirects disabled')
requests[1].cb(204,'',{}); step()
assert(#requests==2 and requests[1].url~=requests[2].url,'independent destinations sent')
requests[2].cb(204,'',{})
assert(AxiomWebhook.status().queued==0 and AxiomWebhook.status().counters.delivered==2)
reload(); assert(not AxiomWebhook.enqueue(server,event('fanout')),'dedupe survives restart')
assert(AxiomWebhook.configure(url,{'system'})); assert(AxiomWebhook.configureMany({}))
assert(AxiomWebhook.enqueue(server,event('local','system')),'remote removal preserves local destination')
assert(not json.encode(AxiomWebhook.status()):find('TOKEN',1,true),'status hides credentials')
''')

lua = runtime()
lua.execute('''
assert(AxiomWebhook.configure(url))
assert(AxiomWebhook.enqueue(server,event('retry'))); step()
requests[1].cb(429,'{"retry_after":5}',{})
assert(AxiomWebhook.status().queued==1,'429 retains pending entry')
step(4); assert(#requests==1,'honors retry_after')
reload(); step(1); assert(#requests==2,'retry and rate gate survive restart')
requests[1].cb(204,'',{}); assert(AxiomWebhook.status().queued==1,'stale callback cannot acknowledge retry')
requests[2].cb(503,'',{}); step(4); assert(#requests==3)
requests[3].cb(204,'',{}); assert(AxiomWebhook.status().queued==0)
assert(AxiomWebhook.enqueue(server,event('large-delay'))); step()
requests[4].cb(429,'{"retry_after":9999}',{})
step(900); assert(#requests==4,'excessive delay held for operator')
assert(AxiomWebhook.status().failed==1)
commands.guard_webhook(0,{'retry'}); step(); assert(#requests==5)
requests[5].cb(400,'credentials must not escape',{})
assert(AxiomWebhook.status().failed==1 and AxiomWebhook.status().queued==1,'permanent rejection retained')
''')

lua = runtime()
lua.execute('''
assert(AxiomWebhook.configureMany(hooks()))
assert(AxiomWebhook.enqueue(server,event('cancel'))); step()
local first=requests[1]; local replacement=hooks(); replacement[1].enabled=false; replacement[2].enabled=false
assert(AxiomWebhook.configureMany(replacement))
assert(AxiomWebhook.status().queued==0 and AxiomWebhook.status().counters.cancelled==2)
first.cb(204,'',{}); assert(AxiomWebhook.status().counters.delivered==0,'disabled version cannot be acknowledged')
assert(AxiomWebhook.configureMany(hooks()))
assert(not AxiomWebhook.enqueue(server,event('cancel')),'cancelled event not resurrected by replay')
assert(AxiomWebhook.enqueue(server,event('new'))); step()
replacement=hooks(); replacement[1].url=url2; replacement[2].url=url
assert(AxiomWebhook.configureMany(replacement)); assert(AxiomWebhook.status().queued==0,'changed endpoints cancel old version')
''')

lua = runtime()
lua.execute('''
assert(AxiomWebhook.configure(url))
failSave=true; assert(not AxiomWebhook.enqueue(server,event('durable')))
step(); assert(#requests==0,'no send before durable outbox')
failSave=false; step(5); assert(#requests==1,'recovers storage outage')
local old=requests[1]
step(30); assert(AxiomWebhook.status().counters.timeouts==1)
step(2); assert(#requests==2)
old.cb(204,'',{}); assert(AxiomWebhook.status().queued==1,'late timed-out callback ignored')
requests[2].cb('204','',{}); assert(AxiomWebhook.status().failed==1,'invalid callback not successful')
commands.guard_webhook(0,{'retry'}); nativeFails=true
for _=1,8 do step(120) end
assert(AxiomWebhook.status().failed==1 and AxiomWebhook.status().counters.delivered==0,'bounded native failures retained')
assert(not json.encode(AxiomWebhook.status()):find('secret credentials',1,true),'native error details not exposed')
''')

lua = runtime()
lua.execute('''
assert(AxiomWebhook.configure(url))
for index=1,500 do assert(AxiomWebhook.enqueue(server,event('capacity:'..index))) end
assert(not AxiomWebhook.enqueue(server,event('overflow')))
assert(AxiomWebhook.status().queued==500 and AxiomWebhook.status().counters.overflow==1)
assert(not AxiomWebhook.configureMany({{id=1,name='Invalid',url='https://example.com',enabled=true,eventKinds={'detection'}}}))
assert(AxiomWebhook.status().queued==500,'invalid remote configuration leaves queue intact')
failSave=true; assert(not AxiomWebhook.configure(''))
assert(AxiomWebhook.status().configured and AxiomWebhook.status().queued==500,'failed save leaves previous policy and queue')
''')
print('PASS: Lua webhook fan-out, console isolation, redaction, durable dedupe, version cancellation, retry/restart, timeout identity, native failures, backpressure')
