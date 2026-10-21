param(
    [Parameter(Mandatory=$true)][string]$Site,
    [Parameter(Mandatory=$true)][string]$EnvironmentFile,
    [Parameter(Mandatory=$true)][string]$Ruby,
    [Parameter(Mandatory=$true)][string]$Node,
    [Parameter(Mandatory=$true)][string]$WinSW,
    [Parameter(Mandatory=$true)][string]$BackupDirectory,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$envValues = @{}
Get-Content -LiteralPath $EnvironmentFile | ForEach-Object {
    if ($_ -match '^([A-Z_]+)=(.*)$') { $envValues[$matches[1]] = $matches[2].Trim().Trim('"') }
}
$data = $envValues['DATA_DIR']
if (!$data -or ![IO.Path]::IsPathRooted($data)) { throw 'DATA_DIR must be explicit and absolute.' }
$database = Join-Path $data 'payments.sqlite'
if (!(Test-Path -LiteralPath $database)) { throw 'Existing ledger not found; refusing empty database cutover.' }
foreach ($binary in @($Ruby,$Node,$WinSW)) { if (!(Test-Path -LiteralPath $binary)) { throw "Runtime not found: $binary" } }
if (!(Test-Path (Join-Path $Site 'apps\merchant-console\.next\BUILD_ID'))) { throw 'Build merchant-console before cutover.' }
if (Test-Path -LiteralPath $BackupDirectory) { throw 'BackupDirectory must be new.' }
if ($envValues['RUBY'] -ne $Ruby) { throw 'Set RUBY in the protected environment file before activating.' }
if (!$Apply) {
    Write-Output "Plan only: stop old API and all workers, preserve $database, verify backup, update three service definitions. Rerun with -Apply only after approval."
    return
}
New-Item -ItemType Directory -Path $BackupDirectory | Out-Null
$serviceRoot = Split-Path -Parent $EnvironmentFile
$ids = @('DjPayment','AxiomPaymentConsole','AxiomPaymentWorker')
$previous = @{}
foreach ($id in $ids) {
    $service = Get-Service $id -ErrorAction SilentlyContinue
    $previous[$id] = $service -and $service.Status -eq 'Running'
    if ($service) { Stop-Service $id -ErrorAction Stop }
    $xml = Join-Path $serviceRoot "$id.xml"
    if (Test-Path $xml) { Copy-Item -LiteralPath $xml -Destination $BackupDirectory }
}
try {
    $env:BUNDLE_GEMFILE = Join-Path $Site 'apps\payment-core\Gemfile'
    & $Ruby (Join-Path $Site 'operations\backup.rb') $database (Join-Path $BackupDirectory 'payments.sqlite')
    if ($LASTEXITCODE -ne 0) { throw 'Backup verification failed.' }
    foreach ($id in $ids) {
        $mode = if ($id -eq 'DjPayment') {'api'} elseif ($id -eq 'AxiomPaymentConsole') {'console'} else {'worker'}
        $xmlPath = Join-Path $serviceRoot "$id.xml"
        $template = if ($id -eq 'DjPayment') { 'Payment.xml' } else { "$id.xml" }
        [xml]$definition = Get-Content (Join-Path $Site "operations\$template") -Raw
        $definition.service.executable = $Node
        $definition.service.arguments = "--env-file=`"$EnvironmentFile`" `"$(Join-Path $Site 'operations\run.cjs')`" $mode"
        $definition.service.workingdirectory = $Site
        $definition.Save($xmlPath)
        $exe = Join-Path $serviceRoot "$id.exe"
        if (!(Test-Path $exe)) { Copy-Item -LiteralPath $WinSW -Destination $exe }
        if (!(Get-Service $id -ErrorAction SilentlyContinue)) { & $exe install; if ($LASTEXITCODE -ne 0) { throw "Install failed: $id" } }
    }
    Start-Service DjPayment,AxiomPaymentConsole,AxiomPaymentWorker
    Write-Output "Processes started. Keep public ingress closed until smoke verification. Backup: $BackupDirectory. Caddy was not changed."
} catch {
    foreach ($id in $ids) {
        Stop-Service $id -ErrorAction SilentlyContinue
        $backupXml = Join-Path $BackupDirectory "$id.xml"
        if (Test-Path $backupXml) { Copy-Item $backupXml (Join-Path $serviceRoot "$id.xml") -Force }
    }
    # Never restore the database over writes potentially accepted after startup.
    foreach ($id in $ids) { if ($previous[$id]) { Start-Service $id -ErrorAction Continue } }
    throw
}
