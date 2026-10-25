param([string] $Image = 'se7e-persona-v2-candidate:local', [switch] $TestServer)
$ErrorActionPreference = 'Stop'
if ($Image -notmatch '^[a-zA-Z0-9][a-zA-Z0-9:._/@-]*$') { throw 'Invalid candidate image reference.' }
$inspected = & docker image inspect $Image 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Candidate image must already exist; no build or pull fallback.' }
$candidate = ($inspected | ConvertFrom-Json)[0]
if ($candidate.Id -notmatch '^sha256:[a-f0-9]{64}$' -or ($candidate.Config.Entrypoint -join ' ') -ne './docker-entrypoint-persona-v2.sh') { throw 'Candidate image identity/runtime invalid.' }
$imageId = $candidate.Id
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$project = 'se7e-candidate-test-' + [guid]::NewGuid().ToString('N')
$fixture = Join-Path ([IO.Path]::GetTempPath()) $project
$null = New-Item -ItemType Directory -Path $fixture
$envFile = Join-Path $fixture '.env'
$composeFile = Join-Path $root 'docker-compose.persona-v2.yml'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$password = [guid]::NewGuid().ToString('N')
@(
    "PERSONA_V2_POSTGRES_PASSWORD=$password",
    "PERSONA_V2_CANDIDATE_IMAGE=$imageId",
    "PERSONA_V2_ENCRYPTION_KEY=$secret",
    'PERSONA_V2_HUB_URL=https://hub-fixture.invalid',
    "PERSONA_V2_LOCAL_PORT=$port",
    "PERSONA_V2_PUBLIC_BASE_URL=http://127.0.0.1:$port"
) | Set-Content -LiteralPath $envFile -Encoding ascii
$compose = @('compose', '--env-file', $envFile, '-f', $composeFile, '-p', $project)
if ($TestServer) {
    if ($candidate.Config.Labels.'io.se7e.runtime' -ne 'persona-v2-test-server') { throw 'Expected test-server image.' }
    $override = Join-Path $fixture 'test-server.yml'
    @'
services:
  server:
    environment:
      NODE_ENV: production
      PERSONA_V2_DEPLOYMENT: test-server
      PUBLIC_BASE_URL: https://persona-fixture.invalid
  worker:
    environment:
      NODE_ENV: production
      PERSONA_V2_DEPLOYMENT: test-server
      PUBLIC_BASE_URL: https://persona-fixture.invalid
  migrate:
    environment:
      NODE_ENV: production
      PERSONA_V2_DEPLOYMENT: test-server
      PUBLIC_BASE_URL: https://persona-fixture.invalid
'@ | Set-Content -LiteralPath $override -Encoding ascii
    $compose += @('-f', $override)
}
$previous = @{}
# A caller's candidate secrets/settings must not override this isolated fixture.
$keys = @('PERSONA_V2_CANDIDATE_IMAGE', 'PERSONA_V2_POSTGRES_PASSWORD', 'PERSONA_V2_ENCRYPTION_KEY', 'PERSONA_V2_HUB_URL', 'PERSONA_V2_LOCAL_PORT', 'PERSONA_V2_PUBLIC_BASE_URL', 'PERSONA_V2_CANDIDATE_TAG', 'PERSONA_V2_CANDIDATE_REVISION', 'PERSONA_V2_ENCRYPTION_KEY_ID', 'PERSONA_V2_QUERY_CACHE_TTL_MS', 'PERSONA_V2_OAUTH_ENABLED', 'PERSONA_V2_OAUTH_CLIENTS')
foreach ($key in $keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
}
function Invoke-Compose([string[]] $Arguments) {
    if ($Arguments[0] -eq 'run') { $Arguments = @('run', '--pull', 'never') + $Arguments[1..($Arguments.Count - 1)] }
    $output = & docker @compose @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $safe = ($output -join "`n").Replace($secret, '[redacted]').Replace($password, '[redacted]')
        throw "Candidate fixture command failed ($($Arguments[0])); no automatic retry. $safe"
    }
    return ($output -join "`n")
}
function Refuse-Compose([string[]] $Arguments, [string] $Expected) {
    if ($Arguments[0] -eq 'run') { $Arguments = @('run', '--pull', 'never') + $Arguments[1..($Arguments.Count - 1)] }
    $output = & docker @compose @Arguments 2>&1
    if ($LASTEXITCODE -eq 0) { throw 'Candidate unexpectedly accepted a forbidden start.' }
    if (($output -join "`n") -notmatch [regex]::Escape($Expected)) {
        $safe = ($output -join "`n").Replace($secret, '[redacted]').Replace($password, '[redacted]')
        throw "Candidate refusal did not prove the expected safeguard: $safe"
    }
}
function Assert-Ready {
    $response = Invoke-RestMethod "http://127.0.0.1:$port/ready"
    if (!$response.ready -or $response.generation -ne 'persona-v2' -or $response.complete) { throw 'Candidate readiness contract differs.' }
}
function Assert-WorkerHealth {
    $status = Invoke-Compose -Arguments @('exec', '-T', 'worker', 'node', '-e', "fetch('http://127.0.0.1:3335/health').then(async r=>{if(!r.ok)process.exit(1);console.log((await r.json()).status)}).catch(()=>process.exit(1))")
    if ($status.Trim() -ne 'healthy') { throw 'Packaged worker health differs.' }
}
function Assert-WorkerStopped {
    $id = (Invoke-Compose -Arguments @('ps', '-aq', 'worker')).Trim()
    if ($id -notmatch '^[a-f0-9]{64}$') { throw 'Missing worker fixture identity.' }
    $state = & docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}} {{.State.Running}}' $id
    if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne '0 false false') { throw 'Worker did not stop gracefully.' }
}
function Invoke-BackupFixture([string] $Mode) {
    $script = Join-Path $PSScriptRoot 'candidate-backup-fixture.mjs'
    $digest = Invoke-Compose -Arguments @('run', '--rm', '--no-deps', '--entrypoint', 'node', '-v', "${script}:/tmp/backup-fixture.mjs:ro", 'server', '/tmp/backup-fixture.mjs', $Mode)
    $match = [regex]::Match($digest, '(?m)^[a-f0-9]{64}\r?$')
    if (!$match.Success) { throw 'Backup fixture did not produce a digest.' }
    return $match.Value.Trim()
}
try {
    $null = Invoke-Compose -Arguments @('config', '--quiet')
    $null = Invoke-Compose -Arguments @('up', '-d', '--wait', 'database', 'redis')
    foreach ($mode in @('server', 'worker', 'migrate')) {
        Refuse-Compose -Arguments @('run', '--rm', '--no-deps', '-e', 'NODE_ENV=production', '-e', 'PERSONA_V2_DEPLOYMENT=local', 'server', $mode) -Expected 'bloqueado fora'
    }
    Refuse-Compose -Arguments @('run', '--rm', '--no-deps', '-e', 'MCP_ENCRYPTION_KEY=', 'server', 'server') -Expected 'banco dedicado e chave externa'
    Refuse-Compose -Arguments @('run', '--rm', '--no-deps', 'server', 'legacy') -Expected 'Comando de candidato recusado'
    Refuse-Compose -Arguments @('run', '--rm', '--no-deps', 'server', 'server') -Expected 'Aplique as migrações persona-v2'
    $empty = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-U', 'persona_v2', '-d', 'persona_v2_candidate', '-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
    if ($empty.Trim() -ne '0') { throw 'Startup changed the empty database.' }
    $null = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'persona_v2', '-d', 'persona_v2_candidate', '-c', 'CREATE TABLE acesso(id integer); INSERT INTO acesso VALUES (7)')
    Refuse-Compose -Arguments @('run', '--rm', '--no-deps', 'migrate', 'migrate') -Expected 'Banco legado ou desconhecido recusado sem alteração'
    $preserved = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-U', 'persona_v2', '-d', 'persona_v2_candidate', '-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'; SELECT id FROM acesso")
    if (($preserved.Trim() -split '\r?\n') -join ',' -ne '1,7') { throw 'Legacy fixture was modified by migration refusal.' }
    $null = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'persona_v2', '-d', 'persona_v2_candidate', '-c', 'DROP TABLE acesso')
    $null = Invoke-Compose -Arguments @('run', '--rm', '--no-deps', 'migrate', 'migrate')
    $before = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-U', 'persona_v2', '-d', 'persona_v2_candidate', '-Atc', 'SELECT count(*) FROM _persona_v2_migrations')
    if ([int]$before.Trim() -lt 1) { throw 'Packaged migrations missing.' }
    $null = Invoke-Compose -Arguments @('run', '--rm', '--no-deps', 'migrate', 'migrate')
    $backupDigest = Invoke-BackupFixture -Mode 'seed'
    $null = Invoke-Compose -Arguments @('up', '-d', '--no-build', '--wait', 'server', 'worker')
    Assert-Ready
    Assert-WorkerHealth
    foreach ($asset in @('app/', 'app/favicon.ico', 'app/apple-touch-icon.png', 'app/persona-v2.webmanifest', 'app/icon-192.png')) {
        $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/$asset"
        if ($response.StatusCode -ne 200) { throw 'Packaged console asset unavailable.' }
    }
    $null = Invoke-Compose -Arguments @('stop', 'server', 'worker')
    Assert-WorkerStopped
    # Offline snapshot into a NEW fixture database; retain the original until cleanup.
    $null = Invoke-Compose -Arguments @('exec', '-T', 'database', 'pg_dump', '-U', 'persona_v2', '-Fc', '-f', '/tmp/persona-fixture.dump', 'persona_v2_candidate')
    $null = Invoke-Compose -Arguments @('exec', '-T', 'database', 'createdb', '-U', 'persona_v2', 'se7e_persona_v2_restored')
    $null = Invoke-Compose -Arguments @('exec', '-T', 'database', 'pg_restore', '-U', 'persona_v2', '--exit-on-error', '--single-transaction', '-d', 'se7e_persona_v2_restored', '/tmp/persona-fixture.dump')
    $null = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'persona_v2', '-d', 'postgres', '-c', 'ALTER DATABASE persona_v2_candidate RENAME TO se7e_persona_v2_original')
    $null = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'persona_v2', '-d', 'postgres', '-c', 'ALTER DATABASE se7e_persona_v2_restored RENAME TO persona_v2_candidate')
    if ((Invoke-BackupFixture -Mode 'verify') -ne $backupDigest) { throw 'Restored fixture differs from backup.' }
    $null = Invoke-Compose -Arguments @('up', '-d', '--no-build', '--wait', 'server', 'worker')
    Assert-Ready
    Assert-WorkerHealth
    $after = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-U', 'persona_v2', '-d', 'persona_v2_candidate', '-Atc', 'SELECT count(*) FROM _persona_v2_migrations')
    if ($after.Trim() -ne $before.Trim()) { throw 'Migration count changed on restart.' }
    $logs = Invoke-Compose -Arguments @('logs', '--no-color', 'worker')
    foreach ($job in @('review', 'ephemeral', 'retention', 'outbox')) {
        if ([regex]::Matches($logs, "persona $job worker completed").Count -lt 2 -or $logs -match 'tick failed|shutdown failed') { throw 'Packaged worker did not complete its cycle before and after restart.' }
    }
    $null = Invoke-Compose -Arguments @('stop', 'server', 'worker')
    Assert-WorkerStopped
    if ((Invoke-BackupFixture -Mode 'verify') -ne $backupDigest) { throw 'Worker changed protected restored fixture state.' }
    $null = Invoke-Compose -Arguments @('exec', '-T', 'database', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'persona_v2', '-d', 'persona_v2_candidate', '-c', "UPDATE _persona_v2_migrations SET checksum=repeat('0',64) WHERE filename=(SELECT min(filename) FROM _persona_v2_migrations)")
    Refuse-Compose -Arguments @('run', '--rm', '--no-deps', 'server', 'server') -Expected 'Checksum de migração persona-v2 incompatível'
    Refuse-Compose -Arguments @('run', '--rm', '--no-deps', 'worker', 'worker') -Expected 'Banco ou keyring persona-v2 incompatível'
    Write-Output "Candidate fixture passed: production/secret/command refusal, legacy/checksum refusal, no automatic DDL, migrations, assets, four jobs, backup/restore and restart ($($before.Trim()) migrations)."
} finally {
    try {
        # The random project owns these resources; never clean a caller's compose project.
        $owned = & docker ps -aq --filter "label=com.docker.compose.project=$project"
        if ($LASTEXITCODE -ne 0) { throw 'Cannot establish fixture ownership for cleanup.' }
        $null = Invoke-Compose -Arguments @('down', '--volumes', '--remove-orphans')
        $remaining = & docker ps -aq --filter "label=com.docker.compose.project=$project"
        if ($LASTEXITCODE -ne 0 -or $remaining) { throw 'Candidate fixture containers remain.' }
        $volumes = & docker volume ls -q --filter "label=com.docker.compose.project=$project"
        if ($LASTEXITCODE -ne 0 -or $volumes) { throw 'Candidate fixture volumes remain.' }
        $resolved = [IO.Path]::GetFullPath($fixture)
        $expected = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) $project))
        if ($resolved -ne $expected -or (Get-Item -LiteralPath $resolved).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe fixture directory.' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
        Write-Output 'Candidate fixture cleanup confirmed.'
    } finally {
        foreach ($key in $keys) {
            if ($null -eq $previous[$key]) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
            else { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
        }
    }
}
