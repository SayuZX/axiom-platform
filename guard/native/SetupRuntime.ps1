[CmdletBinding()]
param([string]$Stage, [string]$Tar = 'tar.exe')
$ErrorActionPreference = 'Stop'
if (!$Stage) { $Stage = Join-Path $PSScriptRoot '.runtime' }
# Isolated MSYS2 UCRT64 packages; no installation or machine PATH changes.
# Metadata: https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-libobjc
$packages = @(
    @('gcc-objc-16.2.0-4', '9675782e4f4479f6bf3beaa5c9c2283cbd0747782b7d1784fc6aa6171bd99d11'),
    @('libobjc-16.2.0-4', 'f59466d7da964aabf550b6d470e1182a1f07485f36f73eeb0146e1fc14b70466'),
    @('libgcc-16.2.0-4', 'de65b4adae899d9278427402e29d03860bacba481794460f3a1d078610cbb783'),
    @('libwinpthread-14.0.0.r426.g4564ee4b5-1', 'f8de8153bbc0e47ba244a423c12c426fa1d9f56395117ecaa34c6ad6ebed6ca3')
)
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
$zip = Join-Path $Stage 'zstd-v1.5.7-win64.zip'
if (!(Test-Path -LiteralPath $zip)) {
    & curl.exe --fail --location --output $zip 'https://github.com/facebook/zstd/releases/download/v1.5.7/zstd-v1.5.7-win64.zip'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot download Zstandard' }
}
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash -ne 'acb4e8111511749dc7a3ebedca9b04190e37a17afeb73f55d4425dbf0b90fad9') {
    throw 'Zstandard SHA256 mismatch'
}
Expand-Archive -LiteralPath $zip -DestinationPath $Stage -Force
$zstd = Join-Path $Stage 'zstd-v1.5.7-win64\zstd.exe'
foreach ($package in $packages) {
    $name = "mingw-w64-ucrt-x86_64-$($package[0])-any.pkg.tar.zst"
    $archive = Join-Path $Stage $name
    if (!(Test-Path -LiteralPath $archive)) {
        & curl.exe --fail --location --output $archive "https://mirror.msys2.org/mingw/ucrt64/$name"
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $name" }
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash -ne $package[1]) {
        throw "SHA256 mismatch: $name"
    }
    $unpacked = $archive.Substring(0, $archive.Length - 4)
    & $zstd -d -f $archive -o $unpacked
    if ($LASTEXITCODE -ne 0) { throw "Decompression failed: $name" }
    # Extract only the prefix, never pacman metadata/install hooks.
    & $Tar -xf $unpacked -C $Stage ucrt64
    if ($LASTEXITCODE -ne 0) { throw "Extraction failed: $name" }
}
Write-Output "Runtime ready: $Stage\ucrt64"
