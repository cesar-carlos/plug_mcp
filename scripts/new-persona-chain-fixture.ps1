param(
    [Parameter(Mandatory = $true)] [string] $PostgresDriverDirectory,
    [string] $SqlAnywhereDirectory = 'C:/Program Files/SQL Anywhere 16/Bin64',
    [string] $AgentCheckout = (Join-Path $PSScriptRoot '../../plug_agente'),
    [switch] $PrivateAccess
)
$ErrorActionPreference = 'Stop'
# Explicit disposable infrastructure only. Never reads .env or configured sources.
$pgDriverSource = (Resolve-Path -LiteralPath $PostgresDriverDirectory).Path
$saBin = (Resolve-Path -LiteralPath $SqlAnywhereDirectory).Path
$markerSql = (Resolve-Path -LiteralPath (Join-Path $AgentCheckout 'tool/sql_anywhere_source_identity.sql')).Path
foreach ($file in @(
    (Join-Path $pgDriverSource 'podbc35w.dll'),
    (Join-Path $saBin 'dbinit.exe'), (Join-Path $saBin 'dbsrv16.exe'),
    (Join-Path $saBin 'dbisql.com'), (Join-Path $saBin 'dbstop.exe')
)) { if (!(Test-Path -LiteralPath $file)) { throw 'Required fixture driver/utility is absent.' } }
& docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is required.' }
$runId = 'se7e_persona_' + [guid]::NewGuid().ToString('N').Substring(0, 12) + '_test'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) $runId
if (Test-Path -LiteralPath $fixtureRoot) { throw 'Refusing to reuse a fixture directory.' }
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$fixtureRoot = (Resolve-Path -LiteralPath $fixtureRoot).Path
if ($PrivateAccess) {
    # Set before writing credentials; child files inherit this private ACL.
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($currentSid)
    foreach ($sid in @($currentSid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $fixtureRoot -AclObject $acl
}
$resources = @{ containers = @(); saPid = $null; saBin = $saBin; dsn = ('se7e_pg_' + $runId.Substring(13, 12)) }
function Save-Resources { $resources | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fixtureRoot 'resources.json') -Encoding utf8 }
function Assert-Native([string] $stage) { if ($LASTEXITCODE -ne 0) { throw "Private fixture failed: $stage" } }
$pgPassword = 'Fixture_' + [guid]::NewGuid().ToString('N') + '!'
$msPassword = 'Fixture_' + [guid]::NewGuid().ToString('N') + '!'
$saPassword = 'Fixture_' + [guid]::NewGuid().ToString('N') + '!'
Save-Resources
try {
    # A fixed private binding must survive Redis container restarts during fault tests.
    $redisHostPort = $null
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        $candidateRedisPort = Get-Random -Minimum 20000 -Maximum 48000
        $redisListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidateRedisPort)
        $redisListener.Server.ExclusiveAddressUse = $true
        try { $redisListener.Start(); $redisHostPort = $candidateRedisPort; break }
        catch [Net.Sockets.SocketException] { if ($attempt -eq 24) { throw 'No isolated Redis port available.' } }
        finally { $redisListener.Stop() }
    }
    Copy-Item -LiteralPath $pgDriverSource -Destination (Join-Path $fixtureRoot 'pgdriver') -Recurse
    $pgName = "$runId-pg"; $msName = "$runId-ms"; $redisName = "$runId-redis"
    foreach ($spec in @(
        @{ name = $pgName; image = 'postgres:17-alpine'; args = @('-e', "POSTGRES_PASSWORD=$pgPassword", '-p', '127.0.0.1::5432') },
        @{ name = $msName; image = 'mcr.microsoft.com/mssql/server:2022-latest'; args = @('-e', 'ACCEPT_EULA=Y', '-e', "MSSQL_SA_PASSWORD=$msPassword", '-e', 'MSSQL_PID=Developer', '-p', '127.0.0.1::1433') },
        @{ name = $redisName; image = 'redis:7.4-alpine'; args = @('-p', "127.0.0.1:${redisHostPort}:6379") }
    )) {
        & docker run --detach --label "se7e.persona.fixture=$runId" --name $spec.name @($spec.args) $spec.image | Out-Null
        Assert-Native 'container startup'
        $resources.containers += $spec.name
        Save-Resources
    }
    $pgPort = [int]((& docker port $pgName 5432/tcp) -split ':')[-1]
    $msPort = [int]((& docker port $msName 1433/tcp) -split ':')[-1]
    $redisPort = [int]((& docker port $redisName 6379/tcp) -split ':')[-1]
    $ready = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        & docker exec $pgName pg_isready -U postgres 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Private PostgreSQL did not become ready.' }
    & docker exec $pgName psql -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $runId" | Out-Null
    Assert-Native 'PostgreSQL business fixture'
    & docker exec $pgName psql -U postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE persona_chain_control_test' | Out-Null
    Assert-Native 'MCP control fixture'
    & docker exec $pgName psql -U postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE persona_chain_hub_test' | Out-Null
    Assert-Native 'Hub Prisma fixture'
    $ready = $false
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        & docker exec $msName /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $msPassword -C -Q 'SELECT 1' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Private SQL Server did not become ready.' }
    & docker exec $msName /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $msPassword -C -b -Q "CREATE DATABASE $runId" | Out-Null
    Assert-Native 'SQL Server fixture'
    # Avoid the Windows dynamic-port range also used by Docker/short-lived clients.
    $saPort = $null
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        $candidatePort = Get-Random -Minimum 20000 -Maximum 48000
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidatePort)
        $listener.Server.ExclusiveAddressUse = $true
        try { $listener.Start(); $saPort = $candidatePort; break }
        catch [Net.Sockets.SocketException] { if ($attempt -eq 24) { throw 'No isolated SQL Anywhere port available.' } }
        finally { $listener.Stop() }
    }
    & (Join-Path $saBin 'dbinit.exe') -dba "DBA,$saPassword" (Join-Path $fixtureRoot "$runId.db") | Out-Null
    Assert-Native 'SQL Anywhere initialization'
    $sa = Start-Process (Join-Path $saBin 'dbsrv16.exe') -WorkingDirectory $fixtureRoot -ArgumentList @(
        '-n', $runId, '-x', "tcpip(MyIP=127.0.0.1;PORT=$saPort)", '-o', "`"$fixtureRoot/sa.log`"", "`"$fixtureRoot/$runId.db`""
    ) -WindowStyle Hidden -PassThru
    $resources.saPid = $sa.Id
    Save-Resources
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($sa.HasExited) { throw 'Private SQL Anywhere exited before TCP readiness; inspect its private log.' }
        $client = [Net.Sockets.TcpClient]::new()
        try { $client.Connect('127.0.0.1', $saPort); $ready = $true; break }
        catch { Start-Sleep -Milliseconds 500 } finally { $client.Dispose() }
    }
    if (!$ready) { throw 'Private SQL Anywhere did not become ready.' }
    $saConnection = "UID=DBA;PWD=$saPassword;ENG=$runId;DBN=$runId;HOST=127.0.0.1:$saPort"
    & (Join-Path $saBin 'dbisql.com') -nogui -onerror exit -c $saConnection $markerSql | Out-Null
    Assert-Native 'SQL Anywhere DBA marker'
    $dsnKey = "HKCU:\Software\ODBC\ODBC.INI\$($resources.dsn)"
    if (Test-Path -LiteralPath $dsnKey) { throw 'Refusing to replace an existing DSN.' }
    New-Item -Path $dsnKey | Out-Null
    $properties = @{ Driver = (Join-Path $fixtureRoot 'pgdriver/podbc35w.dll'); Servername = '127.0.0.1'; Port = "$pgPort"; Database = $runId; Username = 'postgres'; Password = $pgPassword; SSLmode = 'disable' }
    foreach ($key in $properties.Keys) { New-ItemProperty -LiteralPath $dsnKey -Name $key -Value $properties[$key] -PropertyType String | Out-Null }
    if (!(Test-Path -LiteralPath 'HKCU:\Software\ODBC\ODBC.INI\ODBC Data Sources')) {
        New-Item -Path 'HKCU:\Software\ODBC\ODBC.INI\ODBC Data Sources' | Out-Null
    }
    New-ItemProperty -LiteralPath 'HKCU:\Software\ODBC\ODBC.INI\ODBC Data Sources' -Name $resources.dsn -Value 'PostgreSQL Unicode(x64)' -PropertyType String | Out-Null
    $manifest = @{
        runId = $runId; root = $fixtureRoot
        controlDatabaseUrl = "postgresql://postgres:$pgPassword@127.0.0.1:$pgPort/persona_chain_control_test"
        hubDatabaseUrl = "postgresql://postgres:$pgPassword@127.0.0.1:$pgPort/persona_chain_hub_test"
        redisUrl = "redis://127.0.0.1:$redisPort"
        engines = @{
            postgres = @{ database = $runId; port = $pgPort; connectionString = "DSN=$($resources.dsn);DATABASE=$runId;UID=postgres;PWD=$pgPassword" }
            mssql = @{ database = $runId; port = $msPort; connectionString = "Driver={ODBC Driver 18 for SQL Server};SERVER=127.0.0.1,$msPort;DATABASE=$runId;UID=sa;PWD=$msPassword;Encrypt=no;TrustServerCertificate=yes" }
            sybase = @{ database = $runId; port = $saPort; connectionString = "Driver={SQL Anywhere 16};$saConnection" }
        }
    }
    $manifestPath = Join-Path $fixtureRoot 'manifest.json'
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Write-Output $manifestPath
} catch {
    # Retain the explicit owned targets for inspection/cleanup; never reset others.
    Write-Warning "Fixture incompleta preservada em $fixtureRoot; veja resources.json."
    throw
}
