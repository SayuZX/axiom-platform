# Python3 + lupa.lua54. Execute configurable adapters against authoritative framework hosts.
from pathlib import Path
from lupa.lua54 import LuaRuntime
root=Path(__file__).parent/'resource/axiom_guard'
lua=LuaRuntime(unpack_returned_tuples=True)
lua.execute('''
source=0;current='axiom_guard';invoking=nil;handlers={};registered={};resourceStates={axiom_guard='started',['qb-core']='started',qbx_core='started',es_extended='started'}
values={['Framework integration']='Standalone',['Framework money guard']=false,['Inventory integration']='Standalone'}
AxiomFullServer={getConfig=function()return values end}
AxiomRules={finite=function(v)return type(v)=='number' and v==v and math.abs(v)<math.huge end}
function GetCurrentResourceName()return current end
function GetInvokingResource()return invoking end
function GetResourceState(name)return resourceStates[name]or'missing'end
function GetConvar(_,fallback)return fallback end
function AddEventHandler(name,fn)handlers[name]=handlers[name]or{};handlers[name][#handlers[name]+1]=fn end
function RegisterCommand()end
function CreateThread()end
function Wait()end
function fire(name,...)for _,fn in ipairs(handlers[name]or{})do fn(...)end end
function copy(t)local c={};for k,v in pairs(t)do c[k]=v end;return c end
exports=setmetatable({}, {__call=function(_,name,fn)registered[current]=registered[current]or{};registered[current][name]=fn end,
__index=function(_,name)return setmetatable({}, {__index=function(_,method)return function(_,...)
 local owner,previous=current,invoking;current,invoking=name,owner
 local result=table.pack(registered[name][method](...));current,invoking=owner,previous;return table.unpack(result,1,result.n)
end end})end})
baselines={};tracks=0;limit=100
exports('TrackBalances',function(id,balances,identity)baselines[invoking..':'..id..':'..identity]=copy(balances);tracks=tracks+1;return true end)
exports('GuardBalances',function(id,balances,identity)local b=baselines[invoking..':'..id..':'..identity];if not b then return false end;local gain=0;for k,v in pairs(balances)do gain=gain+v-b[k]end;return gain<=limit end)
qbPlayer={PlayerData={source=1,citizenid='qb-char',money={cash=10,bank=20}},Functions={}}
for _,name in ipairs({'AddMoney','RemoveMoney','SetMoney'})do qbPlayer.Functions[name]=setmetatable({}, {__call=function(_,account,amount)
 if qbBefore then qbBefore() end
 if qbReject then return false end
 local balances=qbPlayer.PlayerData.money;balances[account]=name=='SetMoney'and amount or balances[account]+(name=='RemoveMoney'and-amount or amount)
 if qbAfter then qbAfter() end
 if qbError then error('postcommit failure')end
 return true end})end
qbCore={Functions={GetPlayer=function(id)return id==1 and qbPlayer end,GetQBPlayers=function()return {[1]=qbPlayer}end}}
QBCore=qbCore
function qbCall(name,...)
 local owner,previous=current,invoking;current,invoking='qb-core','payroll'
 local result=table.pack(pcall(qbPlayer.Functions[name],...));current,invoking=owner,previous
 if not result[1]then error(result[2])end;return table.unpack(result,2,result.n)
end
registered['qb-core']={GetCoreObject=function()return qbCore end}
qboxHooks={};hookSeq=0;qboxPlayer={PlayerData={source=2,citizenid='qbox-char',money={cash=10,bank=20}}}
registered.qbx_core={GetPlayer=function(id)return id==2 and qboxPlayer end,registerHook=function(name,fn)hookSeq=hookSeq+1;qboxHooks[hookSeq]={name=name,fn=fn};return hookSeq end,removeHooks=function(id)qboxHooks[id]=nil end}
function moneyHook(name,payload)for _,h in pairs(qboxHooks)do if h.name==name and h.fn(payload)==false then return false end end;return true end
''')
for name in ['core.lua','qb_money.lua','qbox.lua','esx.lua']:
 lua.execute((root/'server/integrations'/name).read_text(),name=name)
lua.execute("current='qb-core'")
lua.execute((root/'server/integrations/qb_money.lua').read_text(),name='qb-owner-bridge')
lua.execute("current='axiom_guard'")
lua.execute('''
AxiomIntegrations.refresh();assert(not AxiomIntegrations.status().QBCore.active and not next(qboxHooks),'standalone installs nothing')
values['Framework integration']='QBCore';values['Framework money guard']=true;AxiomIntegrations.refresh();assert(AxiomIntegrations.status().QBCore.active)
assert(not qbCall('AddMoney','cash',101));assert(qbPlayer.PlayerData.money.cash==10,'QBCore rejects before commit')
assert(qbCall('AddMoney','cash',100));assert(qbPlayer.PlayerData.money.cash==110)
assert(not qbCall('SetMoney','cash',211));assert(qbCall('RemoveMoney','cash',10));assert(qbPlayer.PlayerData.money.cash==100)
qbReject=true;assert(not qbCall('AddMoney','cash',50));qbReject=false;assert(qbPlayer.PlayerData.money.cash==100)
qbBefore=function()qbBefore=nil;assert(not qbCall('AddMoney','bank',1),'pending precommit cannot reenter')end
qbAfter=function()qbAfter=nil;assert(qbCall('AddMoney','bank',1),'postcommit handler may reenter');assert(qbCall('AddMoney','bank',1),'subsequent nested transition remains coherent')end
assert(qbCall('AddMoney','cash',1));assert(qbPlayer.PlayerData.money.cash==101 and qbPlayer.PlayerData.money.bank==22)
qbError=true;assert(not pcall(qbCall,'AddMoney','cash',1));qbError=false
assert(qbPlayer.PlayerData.money.cash==102 and baselines['qb-core:1:qb-char'].cash==102,'actual post-error committed state tracked')
values['Framework integration']='Qbox';AxiomIntegrations.refresh();assert(not AxiomIntegrations.status().QBCore.active and AxiomIntegrations.status().Qbox.active)
assert(qbCall('AddMoney','cash',101),'unselected QBCore callable-table original restored')
assert(not moneyHook('addMoney',{source=2,moneyType='cash',amount=101}));assert(qboxPlayer.PlayerData.money.cash==10)
assert(moneyHook('setMoney',{source=2,moneyType='cash',amount=110}));assert(not moneyHook('setMoney',{source=2,moneyType='cash',amount=111}))
assert(moneyHook('addMoney',{moneyType='cash',amount=10000}),'offline bypass')
local before=tracks;source=2;invoking='qbx_core';fire('QBCore:Server:OnMoneyChange',2);assert(tracks==before,'network event cannot inject balance tracking');source=0;invoking=nil
values['Framework integration']='Standalone';AxiomIntegrations.refresh();assert(not next(qboxHooks),'hooks removed on deselect')
values['Framework integration']='Qbox';resourceStates.qbx_core='missing';AxiomIntegrations.refresh();assert(not AxiomIntegrations.status().Qbox.active and AxiomIntegrations.status().Qbox.error,'missing optional framework does not fail core')
values['Framework integration']='Standalone';AxiomIntegrations.refresh()
ESX={Players={},Math={Round=function(v)return math.floor(v+0.5)end}};overrides={}
function ESX.RegisterPlayerFunctionOverrides(key,value)overrides[key]=value end
function ESX.GetExtendedPlayers()return ESX.Players end
function ESX.GetPlayerFromId(id)return ESX.Players[id]end
function makePlayer(id)
 local p={source=id,accounts={money=10,bank=20}}
 p.getIdentifier=function()return 'esx-char-'..id end
 p.getAccounts=function()return copy(p.accounts)end
 p.getAccount=function(name)return p.accounts[name]and{name=name,money=p.accounts[name],round=true}end
 for _,name in ipairs({'setAccountMoney','addAccountMoney','removeAccountMoney'})do p[name]=function(account,amount)
 amount=ESX.Math.Round(amount);p.accounts[account]=name=='setAccountMoney'and amount or p.accounts[account]+(name=='removeAccountMoney'and-amount or amount);return true end end
 p.addMoney=function(amount)return p.addAccountMoney('money',amount)end
 for _,set in pairs(overrides)do for method,factory in pairs(set)do p[method]=factory(p)end end
 ESX.Players[id]=p;return p
end
old=makePlayer(3)
current='es_extended'
''')
lua.execute((root/'server/integrations/esx.lua').read_text(),name='esx-owner-bridge')
lua.execute('''
current='axiom_guard';values['Framework integration']='ESX';AxiomIntegrations.refresh()
local status=AxiomIntegrations.status().ESX;assert(status.active and status.details.pendingReconnect==1)
current='es_extended';p=makePlayer(4);assert(not p.addMoney(100.6) and p.accounts.money==10,'ESX rounded proposal rejected')
assert(p.addMoney(100.4) and p.accounts.money==110,'ESX cash delegation protected')
assert(not p.setAccountMoney('bank',121));assert(p.removeAccountMoney('money',1));assert(p.accounts.money==109)
current='axiom_guard';status=AxiomIntegrations.status().ESX.details;assert(status.protectedPlayers==1 and status.pendingReconnect==1)
local retained=p.addAccountMoney;values['Framework integration']='Standalone';AxiomIntegrations.refresh()
current='es_extended';assert(retained('money',101) and p.accounts.money==210,'retained wrappers fall through after stop')
current='axiom_guard';assert(not next(overrides),'only guard registry cleared')
''')
print('PASS: Standalone no dependencies; QBCore precommit/restoration; Qbox native hooks/offline/source gates; ESX owner factories/cash rounding/reconnect status/stop safety')
