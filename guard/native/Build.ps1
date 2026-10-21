[CmdletBinding()]
param(
    [string]$Gcc = 'C:\AxiomBuild\mingw64\bin\gcc.exe',
    [string]$Runtime,
    [string]$Output
)
$ErrorActionPreference = 'Stop'
if (!$Runtime) { $Runtime = Join-Path $PSScriptRoot '.runtime\ucrt64' }
if (!$Output) { $Output = $PSScriptRoot }
# SetupRuntime.ps1 provisions the real GNU Objective-C headers/runtime in isolation.
# Example: .\Build.ps1 -Runtime C:\AxiomBuild\guard-native-stage\runtime\ucrt64
# Deploy the executable, three adjacent DLLs, and runtime-licenses together.
$include = Join-Path $Runtime 'lib\gcc\x86_64-w64-mingw32\16.2.0\include'
$library = Join-Path $Runtime 'lib\libobjc.dll.a'
if (!(Test-Path -LiteralPath (Join-Path $include 'objc\Object.h')) -or !(Test-Path -LiteralPath $library)) {
    throw 'Missing Objective-C headers/runtime. Run SetupRuntime.ps1, or supply -Runtime.'
}
New-Item -ItemType Directory -Force -Path $Output | Out-Null
$exe = Join-Path $Output 'guard-integrity.exe'
& $Gcc -std=gnu11 -O2 -Wall -Wextra -fno-strict-aliasing -municode -static-libgcc "-I$include" (Join-Path $PSScriptRoot 'Integrity.m') (Join-Path $PSScriptRoot 'compare32.S') (Join-Path $PSScriptRoot 'distribution.S') $library -lbcrypt -o $exe
if ($LASTEXITCODE -ne 0) { throw 'Native Objective-C/assembly compilation failed' }
foreach ($dll in @('libobjc-4.dll', 'libgcc_s_seh-1.dll', 'libwinpthread-1.dll')) {
    Copy-Item -LiteralPath (Join-Path $Runtime "bin\$dll") -Destination (Join-Path $Output $dll) -Force
}
$licenses = Join-Path $Output 'runtime-licenses'
New-Item -ItemType Directory -Force -Path $licenses | Out-Null
foreach ($package in @('libobjc', 'libgcc', 'libwinpthread')) {
    Copy-Item -LiteralPath (Join-Path $Runtime "share\licenses\$package") -Destination $licenses -Recurse -Force
}
Write-Output "Built: $exe"
