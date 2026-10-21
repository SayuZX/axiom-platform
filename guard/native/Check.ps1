[CmdletBinding()]
param([string]$Exe)
$ErrorActionPreference = 'Stop'
if (!$Exe) { $Exe = Join-Path $PSScriptRoot 'guard-integrity.exe' }
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$temp = Join-Path ([IO.Path]::GetTempPath()) ('axiom-native-check-' + [guid]::NewGuid().ToString('N'))
$root = Join-Path $temp 'root'
$manifest = Join-Path $temp 'manifest.sha256'
$link = Join-Path $root 'escape'
function Assert($condition, $message) { if (!$condition) { throw $message } }
function Native([int]$exitCode, [string]$arguments) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = [IO.Path]::GetFullPath($Exe)
    $start.Arguments = $arguments
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = $utf8
    $process = [Diagnostics.Process]::Start($start)
    try {
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        Assert ($process.ExitCode -eq $exitCode) "Exit $($process.ExitCode), expected $exitCode. $stdout $stderr"
        return ($stdout | ConvertFrom-Json)
    } finally { $process.Dispose() }
}
function Scan([int]$exitCode, [string]$scanRoot = $root) {
    Native $exitCode ('scan "{0}" "{1}"' -f $manifest, $scanRoot)
}
function Distribution([int]$exitCode, [string]$public, [string]$private) {
    [IO.File]::WriteAllText((Join-Path $temp 'public.list'), $public, $utf8)
    [IO.File]::WriteAllText((Join-Path $temp 'private.list'), $private, $utf8)
    Native $exitCode ('distribution "{0}" "{1}"' -f (Join-Path $temp 'public.list'), (Join-Path $temp 'private.list'))
}
function Manifest([string]$text) { [IO.File]::WriteAllText($manifest, $text, $utf8) }
New-Item -ItemType Directory -Path (Join-Path $root 'nested') -Force | Out-Null
try {
    $relative = 'nested\caf' + [char]0xe9 + '.lua'
    $file = Join-Path $root $relative
    [IO.File]::WriteAllText($file, 'abc', $utf8)
    $digest = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    Manifest "$digest  $relative`n"
    $result = Scan 0
    Assert ($result.ok -and $result.checked -eq 1 -and $result.violations.Count -eq 0) 'Clean file did not verify'
    # Every byte position must participate in the assembly comparator.
    for ($i = 0; $i -lt 32; $i++) {
        $bad = $digest.ToCharArray()
        $bad[$i * 2] = if ($bad[$i * 2] -eq '0') { '1' } else { '0' }
        Manifest "$(-join $bad)  $relative`n"
        $result = Scan 2
        Assert ($result.violations[0].reason -eq 'changed') "Digest byte $i was ignored"
    }
    Manifest "$digest  $relative`n"
    [IO.File]::WriteAllText($file, 'tampered', $utf8)
    $result = Scan 2
    Assert (!$result.ok -and $result.violations[0].path -ceq $relative -and $result.violations[0].reason -eq 'changed') 'Changed/Unicode JSON failure'
    Remove-Item -LiteralPath $file
    $result = Scan 2
    Assert ($result.violations[0].reason -eq 'missing') 'Missing file was not detected'
    foreach ($path in @('..\outside.txt', '/outside.txt', 'C:\outside.txt', 'nested\..\outside.txt', 'nested\x:stream', 'NUL', 'nested\trailing.', 'bad"name', "bad`tname")) {
        Manifest "$digest  $path`n"
        $result = Scan 2
        Assert ($result.violations[0].reason -eq 'unsafe_path' -and $result.violations[0].path -ceq $path) "Escape or JSON failure: $path"
    }
    $outside = Join-Path $temp 'outside'
    New-Item -ItemType Directory -Path $outside | Out-Null
    [IO.File]::WriteAllText((Join-Path $outside 'outside.txt'), 'abc', $utf8)
    New-Item -ItemType Junction -Path $link -Target $outside | Out-Null
    Manifest "$digest  escape\outside.txt`n"
    $result = Scan 2
    Assert ($result.violations[0].reason -eq 'reparse_point') 'Directory junction escaped root'
    $result = Scan 1 $link
    Assert (!$result.ok -and $result.error) 'Reparse root was accepted'
    New-Item -ItemType Directory -Path (Join-Path $outside 'nested') | Out-Null
    $redirected = Scan 1 (Join-Path $link 'nested')
    Assert (!$redirected.ok -and $redirected.error) 'Ancestor junction redirected the pinned root'
    foreach ($text in @('', "$digest $relative`n", "zz$($digest.Substring(2))  $relative`n", "$digest  $relative`n`n")) {
        Manifest $text
        $result = Scan 1
        Assert (!$result.ok -and $result.error) 'Malformed manifest was accepted'
    }
    foreach ($invalid in @([byte[]](0xc0, 0xaf), [byte[]](0xed, 0xa0, 0x80), [byte[]](0xe2, 0x82), [byte[]](0))) {
        [IO.File]::WriteAllBytes($manifest, $invalid)
        $result = Scan 1
        Assert (!$result.ok -and $result.error) 'Invalid UTF-8/NUL manifest was accepted'
    }
    [IO.File]::WriteAllText($file, 'abc', $utf8)
    Manifest "$([char]0xfeff)$digest  $relative`r`n"
    $result = Scan 0
    Assert ($result.ok -and $result.checked -eq 1) 'UTF-8 BOM/CRLF manifest rejected'
    $result = Native 0 'distribution-selfcheck'
    Assert ($result.ok -and $result.failures -eq 0) 'Assembly guard-page selfcheck failed'
    $public = "r/client/main.lua`nr/shared/config.lua`nr/stream/city.rpf`nr/ui/server/index.js`n"
    $result = Distribution 0 $public "r/server/main.lua`n"
    Assert ($result.ok -and $result.checked -eq 4) 'Gameplay download candidates rejected'
    $result = Distribution 0 '' ''
    Assert ($result.ok -and $result.checked -eq 0) 'Empty inventories rejected'
    $result = Distribution 2 "R\MODULES\billing.lua`n" "r/modules/BILLING.LUA`n"
    Assert ($result.violations.Count -eq 1 -and $result.violations[0].reason -eq 'private_overlap') 'Opaque server script intersection bypassed'
    $result = Distribution 2 "r/server.lua`n" "r/server.lua`n"
    Assert ($result.violations.Count -eq 1 -and $result.violations[0].reason -eq 'private_overlap') 'Exact private inventory not authoritative'
    $result = Distribution 2 "r/caf$([char]0xe9).lua`n" "R/CAF$([char]0xc9).LUA`n"
    Assert ($result.violations[0].reason -eq 'private_overlap') 'Unicode Windows case intersection bypassed'
    $result = Distribution 2 "r/server/main.lua`n" ''
    Assert ($result.violations[0].reason -eq 'private_name') 'Server Lua heuristic bypassed'
    foreach ($unsafe in @('r/../client.lua', 'r/%2e%2e/x', 'r/%252e/x', 'r/x:ads', 'r/NUL.lua', 'r//x', "r/x`n`n")) {
        $result = Distribution 2 $unsafe ''
        Assert ($result.violations[0].reason -eq 'unsafe_path') "Unsafe public path accepted: $unsafe"
    }
    $result = Distribution 2 $public 'r/../private.lua'
    Assert ($result.violations[0].inventory -eq 'private' -and $result.violations[0].reason -eq 'unsafe_path') 'Malformed private inventory accepted'
    $result = Distribution 0 "$([char]0xfeff)r/client.lua`r`n" ''
    Assert ($result.ok -and $result.checked -eq 1) 'Distribution BOM/CRLF rejected'
    foreach ($invalid in @([byte[]](0xc0, 0xaf), [byte[]](0xed, 0xa0, 0x80), [byte[]](0))) {
        [IO.File]::WriteAllBytes((Join-Path $temp 'public.list'), $invalid)
        $result = Native 1 ('distribution "{0}" "{1}"' -f (Join-Path $temp 'public.list'), (Join-Path $temp 'private.list'))
        Assert (!$result.ok -and $result.error) 'Distribution invalid UTF-8/NUL accepted'
    }
    Write-Output 'PASS: integrity/hash/junction checks; assembly distribution boundary bytes/guard pages; public gameplay paths; private intersection; Unicode case; unsafe paths; strict UTF-8; BOM/CRLF'
} finally {
    # Delete only the junction, never recurse through its external destination.
    if (Test-Path -LiteralPath $link) { [IO.Directory]::Delete($link) }
    Remove-Item -LiteralPath $temp -Recurse -Force
}
