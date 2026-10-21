# PowerShell, install.ps1, Windows x64; approved monitor-only installation.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$site='C:\Sites\axiom\guard'
$state='C:\ProgramData\AxiomGuard'
$base='C:\Users\Administrator\Desktop\ax\txdata\QBCore_6CD5F3.base'
$resource="$base\resources\axiom_guard"
if(Get-Service AxiomGuard -ErrorAction SilentlyContinue){throw 'AxiomGuard already installed; refusing to replace service'}
if(Test-Path $resource){throw 'Resource already exists; refusing to replace'}
New-Item -ItemType Directory -Force "$state\data","$state\logs" | Out-Null
& icacls.exe $state /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
if($LASTEXITCODE){throw 'State ACL failed'}
function New-Secret { $bytes=New-Object byte[] 32; $rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($bytes)}finally{$rng.Dispose()};[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
$credentials=@{passwordKey=New-Secret;ingestToken=New-Secret}
# First start writes the Owner password to data\owner-password.txt unless GUARD_OWNER_PASSWORD is supplied.
# Login uses only that password. Users > Reset password replaces it, ends sessions and removes the bootstrap file.
$utf8=New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText("$state\data\credentials.json",($credentials | ConvertTo-Json),$utf8)
& 'C:\Program Files\AxiomRuntime\node-v24.21.0-win-x64\node.exe' "$site\sync-ui.mjs"
if($LASTEXITCODE){throw 'NUI asset packaging failed'}
Copy-Item "$site\resource\axiom_guard" $resource -Recurse
New-Item -ItemType Directory -Force "$resource\server\data" | Out-Null
& icacls.exe $resource /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
if($LASTEXITCODE){throw 'Resource ACL failed'}
$manifest=Get-ChildItem $resource -File -Recurse | Where-Object { $_.FullName -notlike "$resource\server\data\*" } | Sort-Object FullName | ForEach-Object { $relative=$_.FullName.Substring($resource.Length+1).Replace('\','/'); (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()+'  '+$relative }
[IO.File]::WriteAllText("$state\data\integrity.manifest",(($manifest -join "`n")+"`n"),$utf8)
$guardConfig=@"
# Axiom Guard server-only credentials. Never use setr or sets for tokens.
set axiom_guard_url "http://127.0.0.1:3013/anticheat"
set axiom_guard_token "$($credentials.ingestToken)"
set axiom_guard_server "AXIOM Roleplay"
set axiom_guard_dashboard_url "https://axiomcreative.xyz/anticheat/"
ensure axiom_guard
"@
if(Test-Path "$base\axiom_guard.cfg"){throw 'Guard config already exists'}
[IO.File]::WriteAllText("$base\axiom_guard.cfg",$guardConfig,$utf8)
& icacls.exe "$base\axiom_guard.cfg" /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
if($LASTEXITCODE){throw 'Config ACL failed'}
$serverConfig=[IO.File]::ReadAllText("$base\server.cfg")
if($serverConfig.Contains('axiom_guard')){throw 'server.cfg already references guard'}
Copy-Item "$base\server.cfg" "$base\server.cfg.before-axiom-guard"
[IO.File]::AppendAllText("$base\server.cfg","`r`n# Axiom Guard monitor telemetry`r`nexec axiom_guard.cfg`r`n",$utf8)
Copy-Item 'C:\ProgramData\AxiomWeb\AxiomWeb.exe' "$state\AxiomGuard.exe"
Copy-Item "$site\AxiomGuard.xml" "$state\AxiomGuard.xml"
& icacls.exe $site /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
if($LASTEXITCODE){throw 'Application ACL failed'}
& "$state\AxiomGuard.exe" install
if($LASTEXITCODE){throw 'Service install failed'}
& "$state\AxiomGuard.exe" start
if($LASTEXITCODE){throw 'Service start failed'}
$healthy=$false
for($i=0;$i -lt 20;$i++) {try{$health=Invoke-RestMethod 'http://127.0.0.1:3013/anticheat/api/health';if($health.ok){$healthy=$true;break}}catch{};Start-Sleep -Milliseconds 500}
if(-not $healthy){throw 'Dashboard health failed; proxy not changed'}
$proxy='C:\ProgramData\Caddy\Caddyfile'
$current=[IO.File]::ReadAllText($proxy)
if($current.Contains('/anticheat')){throw 'Proxy already references anticheat'}
$anchor="axiomcreative.xyz {"
if(-not $current.Contains($anchor)){throw 'Expected proxy host missing'}
$route=@"
`t@guard_ingest path /anticheat/api/ingest
`thandle @guard_ingest {
`t`trespond 404
`t}
`t@guard path /anticheat /anticheat/*
`thandle @guard {
`t`treverse_proxy 127.0.0.1:3013
`t}
"@
$candidate=$current.Insert($current.IndexOf($anchor)+$anchor.Length,"`n"+$route+"`n")
[IO.File]::WriteAllText("$state\Caddyfile.next",$candidate,$utf8)
& 'C:\Program Files\Caddy\caddy.exe' validate --config "$state\Caddyfile.next" --adapter caddyfile
if($LASTEXITCODE){throw 'Proxy validation failed; live config unchanged'}
Copy-Item $proxy "$state\Caddyfile.before"
Copy-Item "$state\Caddyfile.next" $proxy
& 'C:\Program Files\Caddy\caddy.exe' reload --config $proxy --adapter caddyfile
if($LASTEXITCODE){Copy-Item "$state\Caddyfile.before" $proxy;throw 'Proxy reload failed; previous file restored'}
Write-Output 'INSTALLED: service healthy; monitor config saved; no FXServer restart.'
Write-Output 'Owner password: C:\ProgramData\AxiomGuard\data\owner-password.txt (read locally as Administrator; reset in Users).'
