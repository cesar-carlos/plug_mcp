param([Parameter(Mandatory = $true)] [string] $Manifest)
$ErrorActionPreference = 'Stop'
$manifestPath = (Resolve-Path -LiteralPath $Manifest).Path
$root = Split-Path $manifestPath -Parent
$runId = Split-Path $root -Leaf
if ($runId -notmatch '^se7e_persona_[a-f0-9]{12}_test$' -or
    (Split-Path $root -Parent) -ne [IO.Path]::GetTempPath().TrimEnd('\') -or
    (Split-Path $manifestPath -Leaf) -ne 'manifest.json' -or
    ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Escopo de fixture inválido.' }
$ready = Get-Content -LiteralPath (Join-Path $root 'manual-ready.json') -Raw | ConvertFrom-Json
$sessionRoot = [IO.Path]::GetFullPath([string]$ready.sessionRoot)
if ($ready.format -ne 'persona-manual-ready-v1' -or $ready.runId -ne $runId -or
    (Split-Path $sessionRoot -Parent) -ne $root -or
    (Split-Path $sessionRoot -Leaf) -notmatch '^chain-[a-f0-9]{32}$' -or
    ((Get-Item -LiteralPath $sessionRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Sessão não pertence à fixture.' }
# Derive the target; never trust an arbitrary stopFile from JSON.
Set-Content -LiteralPath (Join-Path $sessionRoot 'manual-stop') -Value 'stop' -Encoding ascii
Write-Output 'Parada solicitada. O terminal que iniciou a sessão aguardará os serviços e conferirá a limpeza. Solicitação não comprova parada.'
