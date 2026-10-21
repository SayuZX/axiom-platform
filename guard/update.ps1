# PowerShell, update.ps1, Windows x64; update only Axiom Guard and its optional dashboard.
param([Parameter(Mandatory=$true)][string]$Stage)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$site='C:\Sites\axiom\guard'
$state='C:\ProgramData\AxiomGuard'
$base='C:\Users\Administrator\Desktop\ax\txdata\QBCore_6CD5F3.base'
$resource="$base\resources\axiom_guard"
$backup="$state\before-panel-"+(Get-Date -Format 'yyyyMMdd-HHmmss')
if(-not (Test-Path "$Stage\resource\axiom_guard\server\backend.lua")){throw 'Stage has no Lua backend'}
& 'C:\Program Files\AxiomRuntime\node-v24.21.0-win-x64\node.exe' "$Stage\sync-ui.mjs"
if($LASTEXITCODE){throw 'NUI asset packaging failed'}
if(Test-Path $backup){throw 'Backup exists'}
New-Item -ItemType Directory $backup | Out-Null
Copy-Item $site "$backup\site" -Recurse
Copy-Item $resource "$backup\resource" -Recurse
Stop-Service AxiomGuard
try {
    Copy-Item "$state\data" "$backup\data" -Recurse
    Get-ChildItem -LiteralPath $Stage -File | Where-Object { $_.Extension -in '.mjs','.json','.ps1','.py' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination "$site\$($_.Name)" -Force }
    Copy-Item "$Stage\public\*" "$site\public" -Force
    foreach($destination in @($resource,"$site\resource\axiom_guard")) {
        foreach($directory in @('server','client','shared','ui')) {
            New-Item -ItemType Directory -Force "$destination\$directory" | Out-Null
            Get-ChildItem -LiteralPath "$Stage\resource\axiom_guard\$directory" | Where-Object { -not ($directory -eq 'server' -and ($_.Name -eq 'data' -or ($_.Name -eq 'bootstrap.json' -and (Test-Path "$destination\server\bootstrap.json")))) } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination "$destination\$directory" -Recurse -Force }
        }
        Copy-Item "$Stage\resource\axiom_guard\fxmanifest.lua" "$destination\fxmanifest.lua" -Force
        New-Item -ItemType Directory -Force "$destination\server\data" | Out-Null
        # Obsolete monoliths only; their replacements are now explicitly loaded.
        foreach($old in @('server.lua','client.lua','full_server.lua','full_client.lua','rules.lua','selfcheck.lua','script_runner.lua','fxmanifesta.lua')) {
            if(Test-Path "$destination\$old"){Remove-Item -LiteralPath "$destination\$old"}
        }
    }
    $utf8=New-Object Text.UTF8Encoding($false)
    $manifest=Get-ChildItem $resource -File -Recurse | Where-Object { $_.FullName -notlike "$resource\server\data\*" } | Sort-Object FullName | ForEach-Object {
        (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()+'  '+$_.FullName.Substring($resource.Length+1).Replace('\','/')
    }
    [IO.File]::WriteAllText("$state\data\integrity.manifest",(($manifest -join "`n")+"`n"),$utf8)
    & icacls.exe $site /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
    if($LASTEXITCODE){throw 'Dashboard ACL failed'}
    & icacls.exe $resource /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
    if($LASTEXITCODE){throw 'Resource ACL failed'}
} catch {
    Write-Output "Deployment failed. Backup: $backup. Resource has not restarted."
    throw
} finally { Start-Service AxiomGuard }
$healthy=$false
for($i=0;$i -lt 30;$i++) {
    try {if((Invoke-RestMethod 'http://127.0.0.1:3013/anticheat/api/health').ok){$healthy=$true;break}} catch {}
    Start-Sleep -Milliseconds 500
}
if(-not $healthy){throw "Dashboard health failed. Do not restart resource; backup: $backup"}
# Preserve configured mode, private Lua stores and existing account credentials.
& "$site\activate.ps1" -Action update
if($LASTEXITCODE){throw 'Resource restart request failed'}
Start-Sleep -Seconds 8
& "$site\activate.ps1" -Action status
Write-Output "DEPLOYED: Axiom Guard in-game dashboard and auto compact. Backup: $backup"
