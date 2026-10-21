from pathlib import Path
from lupa.lua54 import LuaRuntime

lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute('''
handlers={};registered={};source=1
local config={Skills={farming={label='Farming',icon='seed',xpPerLevel={[1]=100,[2]=100}}},MaxLevel=3,
 Notifications={xpGained={duration=1000,position='top'}}}
package.preload.config=function()return config end
player={PlayerData={citizenid='one',metadata={skills={farming={level=1,xp=0}}}},Functions={}}
player.Functions.SetMetaData=function(key,value)player.PlayerData.metadata[key]=value end
local qb={Functions={GetPlayer=function(id)if id==1 then return player end end},Commands={Add=function()end}}
exports=setmetatable({['qb-core']={GetCoreObject=function()return qb end}},
 {__call=function(_,name,fn)registered[name]=fn end})
function RegisterNetEvent(name,fn)handlers[name]=fn end
function AddEventHandler(name,fn)handlers[name]=fn end
function CreateThread()end
function TriggerClientEvent()end
MySQL={update=function()end};json={encode=function()return '{}'end}
''')
path = Path(__file__).parent.parent / 'city/[misc]/ax_misc/server/sv_level.lua'
lua.execute(path.read_text(), name=str(path))
lua.execute('''
if handlers['ax_misc:server:AddXP']then handlers['ax_misc:server:AddXP']('farming',999)end
assert(player.PlayerData.metadata.skills.farming.xp==0 and player.PlayerData.metadata.skills.farming.level==1,
 'client cannot mint arbitrary skill XP')
for _,amount in ipairs({-10,0,0/0,math.huge,0.5,'100'})do registered.AddXP(1,'farming',amount)end
assert(player.PlayerData.metadata.skills.farming.xp==0,'invalid trusted amounts cannot corrupt XP')
registered.AddXP(1,'farming',7)
assert(player.PlayerData.metadata.skills.farming.xp==7,'authoritative job award retained')
registered.AddXP(1,'farming',100)
assert(player.PlayerData.metadata.skills.farming.xp==7 and player.PlayerData.metadata.skills.farming.level==2,
 'trusted award preserves level transition')
''')
print('PASS: client skill mutation rejected; invalid amounts rejected; trusted award and level progression retained')
