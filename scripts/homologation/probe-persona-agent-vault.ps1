param(
    [Parameter(Mandatory = $true)][string]$Flutter,
    [string]$AgentRoot = (Join-Path $PSScriptRoot '../../../plug_agente')
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$agentPath = (Resolve-Path -LiteralPath $AgentRoot).Path
$flutterPath = (Resolve-Path -LiteralPath $Flutter).Path
$testPath = Join-Path $projectRoot 'tests/fixtures/native/persona_vault_concurrency_test.dart'
foreach ($path in @($flutterPath, $testPath)) {
    if ($path -match '[\x00-\x1f"&|<>^%!]') { throw 'Unsafe command path.' }
}
if (!(Test-Path -LiteralPath (Join-Path $agentPath 'lib/infrastructure/stores/flutter_secure_token_secret_store.dart'))) {
    throw 'Explicit agent checkout required.'
}
$cache = Join-Path $projectRoot 'node_modules/.cache'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$probeRoot = Join-Path ([IO.Path]::GetTempPath()) ('se7e_vault_concurrency_' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeRoot | Out-Null
$processes = @()
$priorRoot = $env:PERSONA_VAULT_FIXTURE_ROOT
$priorRole = $env:PERSONA_VAULT_FIXTURE_ROLE
$probeExit = 1
try {
    $env:PERSONA_VAULT_FIXTURE_ROOT = $probeRoot
    foreach ($role in @('a', 'b')) {
        $env:PERSONA_VAULT_FIXTURE_ROLE = $role
        $arguments = '/d /s /c ""{0}" test --no-pub "{1}" --reporter expanded"' -f $flutterPath, $testPath
        $processes += Start-Process -FilePath $env:ComSpec -ArgumentList $arguments `
            -WorkingDirectory $agentPath -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput "$probeRoot/$role.out" -RedirectStandardError "$probeRoot/$role.err"
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(100)
    while (!(Test-Path "$probeRoot/a.ready") -or !(Test-Path "$probeRoot/b.ready")) {
        if ([DateTime]::UtcNow -gt $deadline -or ($processes | Where-Object HasExited)) {
            throw 'Concurrent fixture failed before barrier.'
        }
        Start-Sleep -Milliseconds 200
    }
    Set-Content -LiteralPath "$probeRoot/go" -Value 'go'
    foreach ($process in $processes) {
        if (!$process.WaitForExit(90000)) { throw 'Private writer timed out.' }
    }
    $writersFailed = [bool]($processes | Where-Object { $_.ExitCode -ne 0 })
    if (!$writersFailed) {
        $env:PERSONA_VAULT_FIXTURE_ROLE = 'hold'
        $holder = Start-Process -FilePath $env:ComSpec -ArgumentList $arguments `
            -WorkingDirectory $agentPath -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput "$probeRoot/hold.out" -RedirectStandardError "$probeRoot/hold.err"
        $processes += $holder
        $deadline = [DateTime]::UtcNow.AddSeconds(40)
        while (!(Test-Path "$probeRoot/held")) {
            if ($holder.HasExited -or [DateTime]::UtcNow -gt $deadline) { throw 'Lock holder failed.' }
            Start-Sleep -Milliseconds 100
        }
        $env:PERSONA_VAULT_FIXTURE_ROLE = 'blocked'
        Push-Location $agentPath
        try {
            & $flutterPath test --no-pub $testPath --reporter expanded > (Join-Path $cache 'persona-vault-lock-timeout.log') 2>&1
            if ($LASTEXITCODE -ne 0) { throw 'Lock contention regression failed.' }
        } finally { Pop-Location }
        & taskkill /PID $holder.Id /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not terminate private lock holder.' }
        $holder.WaitForExit()
    }
    $env:PERSONA_VAULT_FIXTURE_ROLE = 'verify'
    Push-Location $agentPath
    try {
        & $flutterPath test --no-pub $testPath --reporter expanded > (Join-Path $cache 'persona-vault-concurrency-verification.log') 2>&1
        $probeExit = $LASTEXITCODE
    } finally { Pop-Location }
    if ($writersFailed) { $probeExit = 1 }
} finally {
    foreach ($process in $processes) {
        if (!$process.HasExited) {
            & taskkill /PID $process.Id /T /F | Out-Null
            $process.WaitForExit()
        }
    }
    foreach ($role in @('a', 'b', 'hold')) {
        foreach ($kind in @('out', 'err')) {
            if (Test-Path "$probeRoot/$role.$kind") {
                Copy-Item -LiteralPath "$probeRoot/$role.$kind" -Destination (Join-Path $cache "persona-vault-$role.$kind.log")
            }
        }
    }
    $env:PERSONA_VAULT_FIXTURE_ROOT = $priorRoot
    $env:PERSONA_VAULT_FIXTURE_ROLE = $priorRole
    $resolvedProbe = (Resolve-Path -LiteralPath $probeRoot).Path
    if ([IO.Path]::GetDirectoryName($resolvedProbe) -ne [IO.Path]::GetTempPath().TrimEnd('\') -or
        [IO.Path]::GetFileName($resolvedProbe) -notmatch '^se7e_vault_concurrency_[a-f0-9]{32}$') {
        throw 'Fixture cleanup target refused.'
    }
    Remove-Item -LiteralPath $resolvedProbe -Recurse -Force
}
exit $probeExit
