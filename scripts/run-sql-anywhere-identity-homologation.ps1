param(
    [Parameter(Mandatory = $true)] [string] $FixtureRoot,
    [string] $AgentCheckout = (Join-Path $PSScriptRoot '../../plug_agente'),
    [string] $SqlAnywhereBin = 'C:/Program Files/SQL Anywhere 16/Bin64',
    [string] $Flutter = 'flutter.bat'
)
$ErrorActionPreference = 'Stop'
$resolvedRoot = [System.IO.Path]::GetFullPath($FixtureRoot).TrimEnd('\', '/')
$runId = Split-Path $resolvedRoot -Leaf
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
if ($runId -notmatch '^se7e_persona_[a-f0-9]{12}_test$' -or
    [System.IO.Path]::GetDirectoryName($resolvedRoot) -ne $tempRoot) {
    throw 'An explicitly named, direct child of the temporary directory is required.'
}
if (Test-Path -LiteralPath $resolvedRoot) { throw 'Fixture root must not already exist.' }
$agentPath = (Resolve-Path -LiteralPath $AgentCheckout).Path
$testPath = Join-Path $agentPath 'tool/homologation/sql_anywhere_source_identity_test.dart'
if (!(Test-Path -LiteralPath $testPath)) { throw 'Required agent test runner is absent.' }
$port = $null
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $candidate = Get-Random -Minimum 63000 -Maximum 65000
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
    try { $listener.Start(); $port = $candidate; break }
    catch { if ($attempt -eq 19) { throw 'No private fixture port available.' } }
    finally { $listener.Stop() }
}
New-Item -ItemType Directory -Path $resolvedRoot | Out-Null
$manifest = Join-Path $resolvedRoot 'native-manifest.json'
# These credentials exist only in this disposable database, never in a registered source.
$connection = "Driver={SQL Anywhere 16};UID=DBA;PWD=Fixture-SA_2026;ENG=$runId;DBN=$runId;HOST=127.0.0.1:$port"
$utilityConnection = $connection -replace '^Driver=\{SQL Anywhere 16\};', ''
$previousManifest = $env:PERSONA_SQL_ANYWHERE_FIXTURE
$server = $null
function Stop-Fixture {
    if ($null -ne $script:server -and !$script:server.HasExited) {
        & (Join-Path $SqlAnywhereBin 'dbstop.exe') -y -c $utilityConnection
        if ($LASTEXITCODE -ne 0) {
            # Native startup can leave an error window alive without a listener.
            # This Process object belongs exclusively to our Start-Process call.
            Write-Warning 'Graceful fixture shutdown unavailable; stopping only its owned process.'
            Stop-Process -InputObject $script:server -Force
        }
        if (!$script:server.WaitForExit(15000)) { throw 'Fixture shutdown did not settle.' }
    }
    $script:server = $null
}
function Start-Fixture([string] $databaseFile) {
    $script:server = Start-Process -FilePath (Join-Path $SqlAnywhereBin 'dbsrv16.exe') -WorkingDirectory $resolvedRoot -ArgumentList @(
        '-n', $runId, '-x', "tcpip(MyIP=127.0.0.1;PORT=$port)", '-o', "`"$resolvedRoot/sa.log`"", "`"$databaseFile`""
    ) -WindowStyle Hidden -PassThru
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($script:server.HasExited) { throw 'Fixture server exited.' }
        $client = [System.Net.Sockets.TcpClient]::new()
        try { $client.Connect('127.0.0.1', $port); Start-Sleep -Milliseconds 500; return }
        catch { Start-Sleep -Milliseconds 500 }
        finally { $client.Dispose() }
    }
    throw 'Fixture listener unavailable.'
}
function Run-Phase([string] $phase) {
    @{ runId = $runId; root = $resolvedRoot; port = $port; connectionString = $connection; phase = $phase } |
        ConvertTo-Json | Set-Content -LiteralPath $manifest
    Push-Location $agentPath
    try {
        & $Flutter test $testPath --reporter expanded
        if ($LASTEXITCODE -ne 0) { throw "Native phase failed: $phase" }
    } finally { Pop-Location }
}
function Provision-Fixture {
    & (Join-Path $SqlAnywhereBin 'dbisql.com') -nogui -onerror exit -c $utilityConnection (Join-Path $agentPath 'tool/sql_anywhere_source_identity.sql')
    if ($LASTEXITCODE -ne 0) { throw 'Provisioning failed.' }
}
function Initialize-Fixture([string] $databaseFile) {
    & (Join-Path $SqlAnywhereBin 'dbinit.exe') -dba 'DBA,Fixture-SA_2026' $databaseFile
    if ($LASTEXITCODE -ne 0) { throw 'Fixture initialization failed.' }
}
$env:PERSONA_SQL_ANYWHERE_FIXTURE = $manifest
Push-Location $resolvedRoot
try {
    Initialize-Fixture "$resolvedRoot/$runId.db"
    Start-Fixture "$resolvedRoot/$runId.db"
    Run-Phase 'missing'
    Provision-Fixture
    Run-Phase 'enroll'
    Stop-Fixture
    Start-Fixture "$resolvedRoot/$runId.db"
    Run-Phase 'restart'
    Stop-Fixture
    $replacement = Join-Path $resolvedRoot 'replacement'
    New-Item -ItemType Directory -Path $replacement | Out-Null
    # Offline copy of our own stopped fixture: restore preserves the provisioned UUID.
    Copy-Item -LiteralPath "$resolvedRoot/$runId.db" -Destination "$replacement/$runId.db"
    Copy-Item -LiteralPath "$resolvedRoot/$runId.log" -Destination "$replacement/$runId.log"
    Start-Fixture "$replacement/$runId.db"
    Run-Phase 'restore'
    Stop-Fixture
    # Explicit DBA re-enrollment of that private copy as a DIFFERENT source.
    # Never called by discovery, enrollment or SQL execution in the product.
    Start-Fixture "$replacement/$runId.db"
    $reenroll = Join-Path $resolvedRoot 'fixture-reenroll.sql'
    'DROP TABLE "DBA"."se7e_source_identity"; COMMIT;' | Set-Content -LiteralPath $reenroll
    & (Join-Path $SqlAnywhereBin 'dbisql.com') -nogui -onerror exit -c $utilityConnection $reenroll
    if ($LASTEXITCODE -ne 0) { throw 'Offline fixture re-enrollment failed.' }
    Provision-Fixture
    Run-Phase 'replacement'
} finally {
    try { Stop-Fixture } finally {
        $env:PERSONA_SQL_ANYWHERE_FIXTURE = $previousManifest
        Pop-Location
    }
}
Write-Output "SQL Anywhere identity evidence: $resolvedRoot"
