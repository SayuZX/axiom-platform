param([string]$ApiKey)
$ErrorActionPreference='Continue'
if (!(Test-Path "C:\Windows\System32\VCRUNTIME140.dll")) { winget install Microsoft.VCRedist.2015+.x64 --silent --accept-package-agreements --accept-source-agreements }
Remove-Item -Recurse -Force "$env:APPDATA\CodeBuddy\CachedData\*" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.codebuddy\models\deepseek*" -ErrorAction SilentlyContinue
$j="$env:APPDATA\CodeBuddy\User\settings.json"
if (Test-Path $j) { try { $c=Get-Content $j -Raw | ConvertFrom-Json } catch { $c=[pscustomobject]@{} } } else { $c=[pscustomobject]@{} }
$c | Add-Member -NotePropertyName "codebuddy.ai.nativeInference" -NotePropertyValue $false -Force
if ($ApiKey) {
  $c | Add-Member -NotePropertyName "codebuddy.ai.deepseek.apiKey" -NotePropertyValue $ApiKey -Force
  $c | Add-Member -NotePropertyName "codebuddy.ai.deepseek.baseUrl" -NotePropertyValue "https://api.deepseek.com" -Force
}
$dir=Split-Path $j
if (!(Test-Path $dir)) { New-Item -ItemType Directory $dir -Force | Out-Null }
$c | ConvertTo-Json -Depth 10 | Set-Content $j -Encoding utf8
try { taskkill /F /IM CodeBuddy.exe 2>$null } catch {}
Start-Sleep 2
try { Start-Process "CodeBuddy" } catch {}
$extra=if($ApiKey){" + apiKey set"}else{""}
"patched $j - nativeInference=false$extra - restart CodeBuddy done"
