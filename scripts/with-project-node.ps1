$Command = @($args)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $projectRoot '.nvmrc') -Raw).Trim()
$runtime = Join-Path $projectRoot "node_modules/.cache/node-$version/node-v$version-win-x64"
$executable = Join-Path $runtime 'node.exe'
if (!(Test-Path -LiteralPath $executable)) {
    throw "Node $version local ausente. Veja docs/persona-v2/validation.md para preparar o runtime oficial."
}
if ((& $executable --version).Trim() -ne "v$version") { throw 'Versão do runtime local divergente.' }
if (!$Command.Count) { throw 'Informe o comando a executar com o Node do projeto.' }
$previousPath = $env:PATH
try {
    $env:PATH = "$runtime;C:\Program Files\Git\bin;$previousPath"
    [string[]] $commandArguments = @()
    if ($Command.Count -gt 1) { $commandArguments = @($Command[1..($Command.Count - 1)]) }
    & $Command[0] @commandArguments
    $commandExitCode = $LASTEXITCODE
} finally {
    $env:PATH = $previousPath
}
exit $commandExitCode
