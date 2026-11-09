param(
    [Parameter(Mandatory = $true)] [string] $Manifest,
    [Parameter(Mandatory = $true)] [string] $Hub,
    [Parameter(Mandatory = $true)] [string] $Agent,
    [Parameter(Mandatory = $true)] [string] $Flutter,
    [Parameter(Mandatory = $true)] [string] $Image,
    [ValidateRange(10, 120)] [int] $Minutes = 60,
    [switch] $CampoPrazos,
    [ValidateSet('', 'pagar', 'receber')] [string] $CampoPrazo = '',
    [ValidateSet('', 'agenda-receber-pagar', 'titulos-receber', 'titulos-pagar', 'vencidos-pagar', 'agenda-pagar', 'saldo-fornecedor', 'horizonte-pagar', 'horizonte-receber', 'atraso-fornecedor', 'cobranca-cliente', 'custo-atual', 'itens-gestao', 'itens-variedade-perdas', 'itens-cestas', 'vendas-distribuicoes', 'vendas-clientes', 'vendas-resumo', 'vendas-vendedor', 'vendas-descontos', 'vendas-municipio')] [string] $CampoConsulta = ''
)
if (@($CampoPrazos, [bool]$CampoPrazo, [bool]$CampoConsulta).Where({ $_ }).Count -gt 1) { throw 'Escolha um único perfil de fixture de prazo.' }
# Emit distinct arguments, never a shell command or expanded credential string.
@('--manifest', $Manifest, '--hub', $Hub, '--agent', $Agent,
    '--flutter', $Flutter, '--image', $Image, '--minutes', [string]$Minutes)
if ($CampoPrazos) { '--campoPrazos' }
if ($CampoPrazo) { '--campoPrazo'; $CampoPrazo }
if ($CampoConsulta) { '--campoConsulta'; $CampoConsulta }
