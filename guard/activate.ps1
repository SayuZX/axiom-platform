# PowerShell, activate.ps1, Windows x64, authorized local txAdmin control.
param([ValidateSet('self','activate','update','status')][string]$Action='self')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$base='C:\Users\Administrator\Desktop\ax\txdata'
$admins=Get-Content "$base\admins.json" -Raw | ConvertFrom-Json
$owner=$admins | Where-Object {$_.master} | Select-Object -First 1
$identifier=$owner.providers.citizenfx.identifier
if(-not $identifier){throw 'Master CitizenFX identifier unavailable'}
$fx=Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'FXServer.exe' -and $_.CommandLine -match 'txAdmin-luaComToken'} | Select-Object -First 1
if($fx.CommandLine -notmatch 'txAdmin-luaComToken\s+([^\s]+)'){throw 'Runtime token unavailable'}
$headers=@{'x-txadmin-token'=$Matches[1];'x-txadmin-identifiers'=$identifier}
$hostUrl='http://127.0.0.1:40120'
$self=Invoke-RestMethod "$hostUrl/auth/self" -Headers $headers
if($self.logout){throw 'Local txAdmin authentication rejected'}
if($Action -eq 'self'){$self | Select-Object name,isMaster,permissions | ConvertTo-Json;exit}
if($Action -eq 'activate' -or $Action -eq 'update'){
 $r=Invoke-RestMethod "$hostUrl/fxserver/commands" -Headers $headers -Method Post -ContentType 'application/json' -Body '{"action":"refresh_res","parameter":""}'
 Write-Output $r.msg
}
function RequestText($url){$r=Invoke-WebRequest -UseBasicParsing $url -Headers $headers;if($r.Content -is [byte[]]){[Text.Encoding]::UTF8.GetString($r.Content)}else{[string]$r.Content}}
$poll="$hostUrl/socket.io/?EIO=4&transport=polling&rooms=liveconsole"
$open=RequestText $poll
$session=($open.Substring(1) | ConvertFrom-Json).sid
if(-not $session){throw 'Console transport unavailable'}
$poll+="&sid=$session"
Invoke-WebRequest -UseBasicParsing $poll -Headers $headers -Method Post -ContentType 'text/plain;charset=UTF-8' -Body '40' | Out-Null
$ready=RequestText $poll
if($ready -notmatch '40\{'){throw "Console rejected: $ready"}
$commands=if($Action -eq 'activate'){@('exec axiom_guard.cfg')}elseif($Action -eq 'update'){@('restart axiom_guard')}else{@('guard_status','guard_backend status','guard_integrations','guard_webhook status','guard_selfcheck')}
foreach($command in $commands){$packet='42'+(ConvertTo-Json -Compress -InputObject @('consoleCommand',$command));Invoke-WebRequest -UseBasicParsing $poll -Headers $headers -Method Post -ContentType 'text/plain;charset=UTF-8' -Body $packet | Out-Null;Write-Output "Sent: $command"}
Invoke-WebRequest -UseBasicParsing $poll -Headers $headers -Method Post -ContentType 'text/plain;charset=UTF-8' -Body '41' | Out-Null
