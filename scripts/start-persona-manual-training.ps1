param(
    [Parameter(Mandatory = $true)] [string] $PostgresDriverDirectory,
    [Parameter(Mandatory = $true)] [string] $Flutter,
    [Parameter(Mandatory = $true)] [string] $CandidateImage,
    [ValidateRange(10, 120)] [int] $Minutes = 60,
    [string] $HubCheckout = (Join-Path $PSScriptRoot '../../plug_server'),
    [string] $AgentCheckout = (Join-Path $PSScriptRoot '../../plug_agente'),
    [string] $SqlAnywhereDirectory = 'C:/Program Files/SQL Anywhere 16/Bin64'
)
$ErrorActionPreference = 'Stop'
$hubPath = (Resolve-Path -LiteralPath $HubCheckout).Path
$agentPath = (Resolve-Path -LiteralPath $AgentCheckout).Path
$flutterPath = (Resolve-Path -LiteralPath $Flutter).Path
$driverPath = (Resolve-Path -LiteralPath $PostgresDriverDirectory).Path
$imageId = & docker image inspect $CandidateImage --format '{{.Id}}'
if ($LASTEXITCODE -ne 0 -or $imageId -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Imagem candidata local obrigatória; nenhuma imagem será publicada ou baixada por este comando.' }
$keys = @('PATH', 'PLUG_SERVER_CHECKOUT', 'NODE_OPTIONS', 'DOTENV_CONFIG_PATH', 'DOTENV_CONFIG_OVERRIDE', 'DOTENV_CONFIG_ENCODING')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
$manifestPath = $null
$sourceRecord = $null
$sessionExit = 1
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    foreach ($key in @('NODE_OPTIONS', 'DOTENV_CONFIG_PATH', 'DOTENV_CONFIG_OVERRIDE', 'DOTENV_CONFIG_ENCODING')) {
        Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
    }
    $env:PLUG_SERVER_CHECKOUT = $hubPath
    $env:PATH = "$driverPath;$($previous['PATH'])"
    & (Join-Path $PSScriptRoot 'with-project-node.ps1') node node_modules/tsx/dist/cli.mjs scripts/check-training-base.ts
    if ($LASTEXITCODE -ne 0) { throw 'Contrato do hub divergente; sessão não iniciada.' }
    $sourceRecord = Join-Path (Get-Location).Path "node_modules/.cache/persona-chain-sources-$([guid]::NewGuid().ToString('N')).json"
    $sourceArguments = @('--hub', $hubPath, '--agent', $agentPath, '--record', $sourceRecord)
    & (Join-Path $PSScriptRoot 'with-project-node.ps1') node scripts/persona-chain-sources.mjs before @sourceArguments
    if ($LASTEXITCODE -ne 0) { throw 'Inventário do candidato indisponível.' }
    $generated = @(& (Join-Path $PSScriptRoot 'new-persona-chain-fixture.ps1') -PostgresDriverDirectory $driverPath -SqlAnywhereDirectory $SqlAnywhereDirectory -AgentCheckout $agentPath -PrivateAccess)
    $manifestPath = [string]$generated[-1]
    if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Fixture não confirmou manifesto privado.' }
    Write-Host "Fixture privada: $manifestPath"
    Write-Host 'Aguarde o endereço do console. Credenciais sintéticas serão gravadas somente no arquivo privado indicado.'
    Write-Host 'Mantenha este terminal aberto; use stop-persona-manual-training.ps1 para encerrar antes do prazo.'
    & (Join-Path $PSScriptRoot 'with-project-node.ps1') node node_modules/tsx/dist/cli.mjs scripts/homologation/manual-training.ts --manifest $manifestPath --hub $hubPath --agent $agentPath --flutter $flutterPath --image $imageId --minutes $Minutes
    $sessionExit = $LASTEXITCODE
} finally {
    try {
        if ($sourceRecord -and (Test-Path -LiteralPath $sourceRecord)) {
            & (Join-Path $PSScriptRoot 'with-project-node.ps1') node scripts/persona-chain-sources.mjs after @sourceArguments --test-exit $sessionExit
            if ($LASTEXITCODE -ne 0) { $sessionExit = 1; Write-Warning 'Sessão encerrada sem certificar candidato estável; confira o inventário.' }
        }
        if ($manifestPath -and (Test-Path -LiteralPath $manifestPath)) {
            $root = Split-Path $manifestPath -Parent
            $receipt = Join-Path $root 'manual-stopped.json'
            $ready = Join-Path $root 'manual-ready.json'
            $safe = $false
            if ((Test-Path -LiteralPath $receipt) -and (Test-Path -LiteralPath $ready)) {
                $stopped = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
                $started = Get-Content -LiteralPath $ready -Raw | ConvertFrom-Json
                $runId = Split-Path $root -Leaf
                $sessionRoot = [IO.Path]::GetFullPath([string]$stopped.sessionRoot)
                $safe = $stopped.format -eq 'persona-manual-stopped-v1' -and $stopped.runId -eq $runId -and
                    $started.format -eq 'persona-manual-ready-v1' -and $started.runId -eq $runId -and
                    $sessionRoot -eq $started.sessionRoot -and (Split-Path $sessionRoot -Parent) -eq $root -and
                    (Split-Path $sessionRoot -Leaf) -match '^chain-[a-f0-9]{32}$' -and
                    $stopped.processesStopped -eq $true -and $stopped.success -eq $true
            }
            if ($safe) { & (Join-Path $PSScriptRoot 'remove-persona-chain-fixture.ps1') -Manifest $manifestPath }
            else { $sessionExit = 1; Write-Warning "Parada limpa não comprovada; fixture preservada: $manifestPath" }
        }
    } finally {
        foreach ($key in $keys) {
            if ($null -eq $previous[$key]) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
            else { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
        }
        Pop-Location
    }
}
exit $sessionExit
