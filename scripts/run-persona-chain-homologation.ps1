param(
    [Parameter(Mandatory = $true)] [string] $Manifest,
    [Parameter(Mandatory = $true)] [string] $Flutter,
    [ValidateSet('prisma', 'memory')] [string] $Persistence = 'prisma',
    [string] $HubCheckout = (Join-Path $PSScriptRoot '../../plug_server'),
    [string] $AgentCheckout = (Join-Path $PSScriptRoot '../../plug_agente'),
    [string[]] $DriverDirectories = @(),
    [ValidateSet('chain', 'manual-training', 'manual-publication')] [string] $Suite = 'chain',
    [string] $TestNamePattern,
    [string] $CandidateImage
)
$ErrorActionPreference = 'Stop'
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
if (Get-ChildItem -LiteralPath (Split-Path $manifestPath -Parent) -Directory -Filter 'chain-*') {
    throw 'Use a new isolated fixture for each chain run; remove the previous fixture with its guarded cleanup script.'
}
$hubPath = (Resolve-Path -LiteralPath $HubCheckout).Path
$agentPath = (Resolve-Path -LiteralPath $AgentCheckout).Path
$flutterPath = (Resolve-Path -LiteralPath $Flutter).Path
if ($Suite -ne 'chain') {
    if ($Persistence -ne 'prisma' -or !$CandidateImage) { throw 'Manual training validation requires an explicit candidate and persistent authority.' }
    & (Join-Path $PSScriptRoot 'homologation/assert-manual-fixture-access.ps1') -Root (Split-Path $manifestPath -Parent)
}
foreach ($required in @(
    (Join-Path $hubPath 'tool/homologation/persona_chain_hub.cts'),
    (Join-Path $agentPath 'tool/homologation/persona_chain_agent_test.dart'),
    (Join-Path $agentPath 'tool/homologation/persona_chain_storage.dart'),
    (Join-Path $agentPath 'tool/homologation/persona_chain_structure_fixture.dart'),
    (Join-Path $agentPath 'tool/homologation/persona_chain_cases.dart'),
    (Join-Path $agentPath 'tool/homologation/persona_publication_fixture.dart'),
    (Join-Path $agentPath 'tool/homologation/persona_chain_observer.dart'),
    (Join-Path $agentPath 'tool/homologation/persona_chain_faults.dart')
)) {
    if (!(Test-Path -LiteralPath $required)) { throw 'Required chain fixture component is absent.' }
}
$keys = @('PERSONA_CHAIN_MANIFEST', 'PERSONA_CHAIN_HUB_CHECKOUT', 'PERSONA_CHAIN_AGENT_CHECKOUT', 'PERSONA_CHAIN_PERSISTENCE', 'PERSONA_CHAIN_CANDIDATE_IMAGE', 'PERSONA_CHAIN_MANUAL_PUBLICATION', 'PLUG_SERVER_CHECKOUT', 'FLUTTER_BIN', 'PATH')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    Remove-Item -LiteralPath Env:PERSONA_CHAIN_CANDIDATE_IMAGE -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath Env:PERSONA_CHAIN_MANUAL_PUBLICATION -ErrorAction SilentlyContinue
    if ($Suite -eq 'manual-publication') { $env:PERSONA_CHAIN_MANUAL_PUBLICATION = '1' }
    if ($CandidateImage) {
        if ($Persistence -ne 'prisma') { throw 'Candidate image requires persistent fixture authority.' }
        $imageId = & docker image inspect $CandidateImage --format '{{.Id}}'
        if ($LASTEXITCODE -ne 0 -or $imageId -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Candidate image not found locally.' }
        $env:PERSONA_CHAIN_CANDIDATE_IMAGE = $imageId
    }
    $env:PLUG_SERVER_CHECKOUT = $hubPath
    & (Join-Path $PSScriptRoot 'with-project-node.ps1') node node_modules/tsx/dist/cli.mjs scripts/check-training-base.ts
    if ($LASTEXITCODE -ne 0) { throw 'Reviewed hub contract differs; chain fixture was not started. Review base, snapshot and tests together.' }
    $sourceRecord = Join-Path (Get-Location).Path "node_modules/.cache/persona-chain-sources-$([guid]::NewGuid().ToString('N')).json"
    $sourceArguments = @('--hub', $hubPath, '--agent', $agentPath, '--record', $sourceRecord)
    & (Join-Path $PSScriptRoot 'with-project-node.ps1') node scripts/persona-chain-sources.mjs before @sourceArguments
    if ($LASTEXITCODE -ne 0) { throw 'Source inventory unavailable; chain fixture was not started.' }
    $env:PERSONA_CHAIN_MANIFEST = $manifestPath
    $env:PERSONA_CHAIN_PERSISTENCE = $Persistence
    $env:PERSONA_CHAIN_HUB_CHECKOUT = $hubPath
    $env:PERSONA_CHAIN_AGENT_CHECKOUT = $agentPath
    $env:FLUTTER_BIN = $flutterPath
    if ($DriverDirectories.Count) {
        $env:PATH = (($DriverDirectories | ForEach-Object { (Resolve-Path -LiteralPath $_).Path }) -join ';') + ";$($previous['PATH'])"
    }
    $configuration = if ($Suite -ne 'chain') { 'vitest.persona-manual.config.ts' } else { 'vitest.persona-chain.config.ts' }
    $testArguments = @('node', 'node_modules/vitest/vitest.mjs', 'run', '--config', $configuration)
    if ($TestNamePattern) { $testArguments += @('--testNamePattern', $TestNamePattern) }
    $testExit = 1
    try {
        & (Join-Path $PSScriptRoot 'with-project-node.ps1') @testArguments
        $testExit = $LASTEXITCODE
    } finally {
        & (Join-Path $PSScriptRoot 'with-project-node.ps1') node scripts/persona-chain-sources.mjs after @sourceArguments --test-exit $testExit
        if ($LASTEXITCODE -ne 0) {
            Write-Warning 'Source revision changed, inventory failed or tests failed. This round does not certify a stable candidate.'
            if ($testExit -eq 0) { $testExit = 1 }
        }
    }
} finally {
    foreach ($key in $keys) {
        if ($null -eq $previous[$key]) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
    }
    Pop-Location
}
exit $testExit
