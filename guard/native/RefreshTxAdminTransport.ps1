# Windows PowerShell, server-only per-boot txAdmin credential bridge. Run as SYSTEM task.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$directory='C:\ProgramData\AxiomGuard\control'
$destination=Join-Path $directory 'txadmin-transport.json'
$utf8=[Text.UTF8Encoding]::new($false)
$last=''
while($true){
    try {
        $server=Get-CimInstance Win32_Process -Filter "name = 'FXServer.exe'"|Where-Object {$_.CommandLine -match 'txAdmin-luaComToken\s+'}|Select-Object -First 1
        if($server -and $server.CommandLine -match 'txAdmin-luaComToken\s+([A-Za-z0-9_-]{16,256})'){
            $token=$Matches[1]
            $port=40120
            if($server.CommandLine -match 'txAdmin-luaComHost\s+127\.0\.0\.1:(\d+)'){$port=[int]$Matches[1]}
            $identity="$($server.ProcessId):$token`:$port"
            if($identity -ne $last -or -not(Test-Path -LiteralPath $destination)){
                $value=@{token=$token;port=$port;serverPid=$server.ProcessId;updatedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
                $temporary=Join-Path $directory 'txadmin-transport.next'
                [IO.File]::WriteAllText($temporary,$value,$utf8)
                Move-Item -LiteralPath $temporary -Destination $destination -Force
                $last=$identity
            }
        }elseif(Test-Path -LiteralPath $destination){
            Remove-Item -LiteralPath $destination
            $last=''
        }
    } catch {
        # Never print process arguments or tokens. Next pass refreshes on recovery.
        Write-EventLog -LogName Application -Source 'Windows PowerShell' -EntryType Warning -EventId 4100 -Message 'Axiom Guard txAdmin transport refresh failed.' -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 5
}
