param(
    [Parameter(Mandatory = $true)] [string] $Manifest,
    [Parameter(Mandatory = $true)] [string] $Hub,
    [Parameter(Mandatory = $true)] [string] $Agent,
    [Parameter(Mandatory = $true)] [string] $Flutter,
    [Parameter(Mandatory = $true)] [string] $Image,
    [ValidateRange(10, 120)] [int] $Minutes = 60,
    [switch] $CampoPrazos,
    [switch] $CampoParcelas,
    [ValidateSet('', 'pagar', 'receber')] [string] $CampoPrazo = '',
    [ValidateSet('', 'estoque-gestao', 'estoque-locais', 'estoque-saldos', 'estoque-movimentos', 'estoque-giro', 'estoque-alertas', 'estoque-atual-vendas', 'cadastro-filiais', 'cadastro-empresas', 'pagamentos-efetivos', 'pontualidade-recebimentos', 'itens-detalhados', 'itens-resumos', 'devolucoes-resumos', 'cadastro-produtos', 'cadastro-tipos-operacao', 'prazo-filial-receber', 'prazo-filial-pagar', 'agenda-receber-pagar', 'titulos-receber', 'titulos-pagar', 'vencidos-pagar', 'agenda-pagar', 'saldo-fornecedor', 'horizonte-pagar', 'horizonte-receber', 'atraso-fornecedor', 'cobranca-cliente', 'custo-atual', 'itens-gestao', 'itens-variedade-perdas', 'itens-cestas', 'vendas-distribuicoes', 'vendas-clientes', 'vendas-resumo', 'vendas-vendedor', 'vendas-descontos', 'vendas-municipio')] [string] $CampoConsulta = ''
)
if (@($CampoPrazos, [bool]$CampoPrazo, [bool]$CampoConsulta).Where({ $_ }).Count -gt 1) { throw 'Escolha um único perfil de fixture de prazo.' }
if ($CampoParcelas -and $CampoConsulta -notin @('estoque-gestao', 'itens-detalhados', 'itens-resumos', 'itens-gestao', 'itens-variedade-perdas', 'itens-cestas', 'vendas-distribuicoes', 'vendas-clientes', 'vendas-resumo', 'vendas-vendedor', 'vendas-descontos', 'vendas-municipio')) { throw 'Parcelas exigem perfil de consulta com vendas.' }
if ($CampoParcelas -and !$CampoConsulta) { throw 'Parcelas exigem perfil de consulta.' }
# Emit distinct arguments, never a shell command or expanded credential string.
@('--manifest', $Manifest, '--hub', $Hub, '--agent', $Agent,
    '--flutter', $Flutter, '--image', $Image, '--minutes', [string]$Minutes)
if ($CampoPrazos) { '--campoPrazos' }
if ($CampoPrazo) { '--campoPrazo'; $CampoPrazo }
if ($CampoConsulta) { '--campoConsulta'; $CampoConsulta }

if ($CampoParcelas) { '--campoParcelas' }
