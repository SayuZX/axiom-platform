# PowerShell, retire-native-billing.ps1, Windows: remove retired fork payment surfaces; preserve router inference.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root='C:\Program Files\AxiomRuntime\node-v24.21.0-win-x64\node_modules\allxd9router\app'
$backup='C:\ProgramData\AxiomAi\native-before-source-billing-20261003'
if(Test-Path $backup){throw 'Native billing backup exists'}
$shared=Join-Path $root '.next-cli-build\server\chunks\3401.js'
if((Get-FileHash $shared -Algorithm SHA256).Hash.ToLower() -ne '930ec42a7ca0b4f2d78f151405f7166cfb43e68dfa740987a20d70bd615cc11e'){throw 'Native shared bundle changed'}
New-Item -ItemType Directory -Path $backup | Out-Null
icacls.exe $backup /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' | Out-Null
$paths=@(
 '.next-cli-build\server\app\api\billing',
 '.next-cli-build\server\app\api\portal',
 '.next-cli-build\server\app\(dashboard)\dashboard\billing',
 '.next-cli-build\server\app\dashboard\billing.html',
 '.next-cli-build\server\app\dashboard\billing.rsc',
 '.next-cli-build\server\app\dashboard\billing.meta',
 '.next-cli-build\server\app\dashboard\billing.segments',
 '.next-cli-build\static\chunks\app\(dashboard)\dashboard\billing',
 '.next-cli-build\static\chunks\app\api\billing',
 '.next-cli-build\static\chunks\app\api\portal',
 '.next-cli-build\server\app\buy',
 '.next-cli-build\server\app\buy.html',
 '.next-cli-build\server\app\buy.rsc',
 '.next-cli-build\server\app\buy.meta',
 '.next-cli-build\server\app\buy.segments',
 '.next-cli-build\static\chunks\app\buy',
 '.next-cli-build\server\app\portal',
 '.next-cli-build\server\app\portal.html',
 '.next-cli-build\server\app\portal.rsc',
 '.next-cli-build\server\app\portal.meta',
 '.next-cli-build\server\app\portal.segments',
 '.next-cli-build\static\chunks\app\portal'
)
Stop-Service AxiomRouter
try {
  Copy-Item (Join-Path $root 'custom-server.js') (Join-Path $backup 'custom-server.js')
  Copy-Item $shared (Join-Path $backup '3401.js')
  foreach($relative in $paths){
    $source=Join-Path $root $relative
    if(Test-Path -LiteralPath $source){
      $destination=Join-Path $backup $relative
      New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
      Move-Item -LiteralPath $source -Destination $destination
    }
  }
  Copy-Item C:\ProgramData\AxiomAi\router-source-billing.cjs (Join-Path $root 'custom-server.js')
  Copy-Item C:\ProgramData\AxiomAi\native-shared-source-billing.js $shared
  Start-Service AxiomRouter
  $ready=$false
  for($i=0;$i -lt 20;$i++){
    try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:20128/api/auth/status;if($r.StatusCode -eq 200){$ready=$true;break} }
    catch { Start-Sleep -Milliseconds 500 }
  }
  if(!$ready){throw 'Router did not recover after payment cutover'}
  Write-Output 'NATIVE_PAYMENT_GATEWAY_REMOVED_ROUTER_HEALTH_OK'
} catch {
  Stop-Service AxiomRouter -ErrorAction SilentlyContinue
  foreach($relative in $paths){
    $saved=Join-Path $backup $relative
    if(Test-Path -LiteralPath $saved){
      $restore=Join-Path $root $relative
      New-Item -ItemType Directory -Path (Split-Path $restore -Parent) -Force | Out-Null
      Move-Item -LiteralPath $saved -Destination $restore
    }
  }
  Copy-Item (Join-Path $backup 'custom-server.js') (Join-Path $root 'custom-server.js')
  Copy-Item (Join-Path $backup '3401.js') $shared
  Start-Service AxiomRouter
  throw
}
