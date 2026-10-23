param([Parameter(Mandatory = $true)] [string] $Manifest)
$ErrorActionPreference = 'Stop'
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$manifestData = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$fixtureRoot = (Resolve-Path -LiteralPath $manifestData.root).Path
$runId = $manifestData.runId
# Resolve and check every deletion target before removing any resource.
if ($runId -notmatch '^se7e_persona_[a-f0-9]{12}_test$' -or
    (Split-Path $fixtureRoot -Leaf) -ne $runId -or
    (Split-Path $fixtureRoot -Parent) -ne [IO.Path]::GetTempPath().TrimEnd('\') -or
    (Split-Path $manifestPath -Parent) -ne $fixtureRoot) { throw 'Invalid disposable fixture scope.' }
$resources = Get-Content -LiteralPath (Join-Path $fixtureRoot 'resources.json') -Raw | ConvertFrom-Json
$containerNames = @(& docker container ls --all --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify disposable container inventory.' }
$labeledContainers = @(& docker container ls --all --filter "label=se7e.persona.fixture=$runId" --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify fixture controller containers.' }
if (@($labeledContainers | Where-Object { $_ -notin $resources.containers }).Count) {
    throw 'A fixture controller container remains; stop and remove its verified session container before cleanup.'
}
$ownedContainers = @()
$ownedVolumes = @()
foreach ($container in $resources.containers) {
    if ($container -notin @("$runId-pg", "$runId-ms", "$runId-redis")) { throw 'Unexpected container target.' }
    # A prior cleanup may already have removed a verified target. Docker failure
    # above is never treated as proof that a container is absent.
    if ($container -notin $containerNames) { continue }
    $label = & docker inspect --format '{{index .Config.Labels "se7e.persona.fixture"}}' $container 2>$null
    if ($LASTEXITCODE -ne 0 -or $label -ne $runId) { throw 'Container ownership cannot be proven.' }
    $ownedContainers += $container
    $mounts = @(& docker inspect --format '{{json .Mounts}}' $container | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify disposable container mounts.' }
    foreach ($mount in $mounts) {
        if ($mount.Type -ne 'volume') { continue }
        if ($mount.Name -notmatch '^[a-f0-9]{64}$') { throw 'Unexpected named volume; fixture retained.' }
        $ownedVolumes += $mount.Name
    }
}
# Anonymous volumes must belong exclusively to the verified fixture containers.
# Never remove a volume used by another container, even one currently stopped.
foreach ($container in $containerNames) {
    if ($container -in $ownedContainers -or !$ownedVolumes.Count) { continue }
    $otherMounts = @(& docker inspect --format '{{json .Mounts}}' $container | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify volume isolation.' }
    foreach ($mount in $otherMounts) {
        if ($mount.Type -eq 'volume' -and $mount.Name -in $ownedVolumes) { throw 'Fixture volume is shared; removal refused.' }
    }
}
$dsn = 'se7e_pg_' + $runId.Substring(13, 12)
if ($resources.dsn -ne $dsn) { throw 'Unexpected DSN target.' }
$dsnKey = "HKCU:\Software\ODBC\ODBC.INI\$dsn"
if (Test-Path -LiteralPath $dsnKey) {
    $driver = (Get-ItemProperty -LiteralPath $dsnKey).Driver
    if ([IO.Path]::GetFullPath($driver) -ne [IO.Path]::GetFullPath((Join-Path $fixtureRoot 'pgdriver/podbc35w.dll'))) { throw 'DSN ownership cannot be proven.' }
}
$saProcess = $null
if ($resources.saPid) {
    $saProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$resources.saPid)"
    if ($saProcess -and ($saProcess.Name -ne 'dbsrv16.exe' -or
        !$saProcess.CommandLine.Contains($fixtureRoot) -or !$saProcess.CommandLine.Contains($runId))) {
        throw 'SQL Anywhere process ownership cannot be proven.'
    }
}
# Call only the owned engine; absence of its process never authorizes another PID.
if ($saProcess) {
    $connection = $manifestData.engines.sybase.connectionString -replace '^Driver=\{SQL Anywhere 16\};', ''
    & (Join-Path $resources.saBin 'dbstop.exe') -y -c $connection | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Owned SQL Anywhere did not stop; fixture retained.' }
    Wait-Process -Id ([int]$resources.saPid) -Timeout 15 -ErrorAction SilentlyContinue
    if (Get-Process -Id ([int]$resources.saPid) -ErrorAction SilentlyContinue) { throw 'Owned engine still running.' }
}
foreach ($container in $ownedContainers) {
    & docker rm --force --volumes $container | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Owned container removal failed; fixture retained.' }
}
if (Test-Path -LiteralPath $dsnKey) { Remove-Item -LiteralPath $dsnKey -Recurse }
$dataSources = 'HKCU:\Software\ODBC\ODBC.INI\ODBC Data Sources'
if (Get-ItemProperty -LiteralPath $dataSources -Name $dsn -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -LiteralPath $dataSources -Name $dsn
}
# Scope was resolved and verified above. Never enumerate/delete neighboring paths.
Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
Write-Output 'Somente a fixture indicada foi removida.'
