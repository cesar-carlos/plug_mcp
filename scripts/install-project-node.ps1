$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $projectRoot '.nvmrc') -Raw).Trim()
if ($version -notmatch '^24\.\d+\.\d+$') { throw 'Versão Node esperada: 24.x.x.' }
$cache = Join-Path $projectRoot "node_modules/.cache/node-$version"
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$archiveName = "node-v$version-win-x64.zip"
$archive = Join-Path $cache $archiveName
$checksums = Join-Path $cache 'SHASUMS256.txt'
Invoke-WebRequest "https://nodejs.org/dist/v$version/SHASUMS256.txt" -OutFile $checksums
Invoke-WebRequest "https://nodejs.org/dist/v$version/$archiveName" -OutFile $archive
$line = Get-Content -LiteralPath $checksums | Where-Object { $_ -match " $([Regex]::Escape($archiveName))$" }
if (@($line).Count -ne 1) { throw 'Checksum oficial ausente ou ambíguo.' }
$expected = ($line -split '\s+')[0]
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Checksum do Node divergente; o pacote não será executado.'
}
Expand-Archive -LiteralPath $archive -DestinationPath $cache -Force
$executable = Join-Path $cache "node-v$version-win-x64/node.exe"
if ((& $executable --version).Trim() -ne "v$version") { throw 'Versão extraída divergente.' }
Write-Output "Node $version verificado e disponível localmente; instalação global preservada."
