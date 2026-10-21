param([string]$LuaSource='C:\AxiomBuild\lua-5.4.9\src',[string]$Gcc='C:\AxiomBuild\mingw64\bin\gcc.exe')
$ErrorActionPreference='Stop'
$files=Get-ChildItem -LiteralPath $LuaSource -Filter '*.c' | Where-Object {$_.Name -notin @('lua.c','luac.c')} | Select-Object -ExpandProperty FullName
if(-not $files){throw 'Verified Lua 5.4 sources required'}
& $Gcc -std=c11 -O2 -Wall -Wextra -static-libgcc "-I$LuaSource" (Join-Path $PSScriptRoot 'ScriptWorker.c') @files -o (Join-Path $PSScriptRoot 'guard-script.exe')
if($LASTEXITCODE){throw 'Script worker compilation failed'}
Write-Output 'Built native bounded Lua worker.'
