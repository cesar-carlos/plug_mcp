# Prazo após revalidação do cruzamento — 2026-10-20

## Defeito e correção

O executor conferia o prazo antes de aguardar autorização, mas não imediatamente
após essa espera. Quando a revalidação consumia o orçamento e o timer ainda não
tinha executado seu callback, a próxima consulta era enviada e só depois recusada.
Agora a conferência ocorre também após autorização e antes do dispatch local.

O teste novo falhou antes da correção: duas chamadas ao gateway em vez de uma.
Com a correção, a primeira fonte permanece consultada e a segunda não é enviada.
O resultado continua BUDGET_EXCEEDED; não há retry ou promessa de cancelamento
de SQL anterior.

## Validação

- 49 testes passaram em três arquivos de execução, publicação e casos de
  cruzamento, 2,07 segundos.
- Tipos e lint dirigido passaram.
- Cadeia persistente: dois cenários passaram em 24,16 segundos, início 10:15:22.
  Filtro cruza PostgreSQL; 77 cenários não selecionados.
- Cruzamentos PostgreSQL/SQL Server e PostgreSQL/SQL Anywhere executaram com
  hub Prisma e agentes reais em bases dedicadas. Limpeza da fixture confirmada.
- training:check confirmou hub 0dc94d6990167f65e093b1fb68a8150630e2057c.

O cenário de vencimento usa relógio controlado e gateway de teste; a cadeia
comprova a regressão do fluxo real, não reproduz exatamente aquela janela.
Não confundir essas duas evidências.

## Limites

Não certifica todas as falhas, revogações concorrentes ou instalação final.
Instruções v2 reforçam que prazo excedido não equivale a resultado vazio ou
completo; essa orientação não foi avaliada por IA consumidora.
A imagem anterior não contém a correção do executor; novo empacotamento será
necessário. Deploy bloqueado e ready:false preservado.
