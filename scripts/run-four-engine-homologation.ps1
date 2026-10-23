param(
    [Parameter(Mandatory = $true)] [string] $Manifest,
    [string] $AgentCheckout = (Join-Path $PSScriptRoot '../../plug_agente'),
    [string] $Flutter = 'flutter.bat',
    [string[]] $DriverDirectories = @()
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$agentPath = (Resolve-Path -LiteralPath $AgentCheckout).Path
$testPath = Join-Path $agentPath 'tool/homologation/sql_operation_four_engines_test.dart'
if (!(Test-Path -LiteralPath $testPath)) { throw 'Runner obrigatório ausente no agente.' }
$previousPath = $env:PATH
$previousManifest = $env:PERSONA_SQL_FIXTURE_MANIFEST
Push-Location $projectRoot
try {
    & (Join-Path $PSScriptRoot 'with-project-node.ps1') node node_modules/tsx/dist/cli.mjs scripts/prepare-operation-homologation.ts $manifestPath
    if ($LASTEXITCODE -ne 0) { throw 'Compilação das fixtures recusada.' }
    $env:PERSONA_SQL_FIXTURE_MANIFEST = $manifestPath
    if ($DriverDirectories.Count) {
        $env:PATH = (($DriverDirectories | ForEach-Object { (Resolve-Path -LiteralPath $_).Path }) -join ';') + ";$previousPath"
    }
    Push-Location $agentPath
    try {
        & $Flutter test $testPath --reporter expanded
        $testExitCode = $LASTEXITCODE
    } finally { Pop-Location }
} finally {
    $env:PATH = $previousPath
    $env:PERSONA_SQL_FIXTURE_MANIFEST = $previousManifest
    Pop-Location
}
exit $testExitCode
