# Tabela/view no editor de consultas — 2026-10-23

## Lacuna e implementação

O contrato já admitia `tables[].resourceType`, com `table` por padrão, mas o
editor privado só expunha nome/grão/significado. Não era possível declarar uma
view pelo formulário. Chromium reproduziu a ausência do seletor.

Cada recurso agora oferece **Tipo do recurso: Tabela ou View**. O valor é salvo,
relido e incluído na publicação. Ausência histórica continua exibida como tabela,
sem modificar o rascunho ao abrir. Não houve mudança de parser, persistência,
policy ou snapshot existente. A seleção não prova existência ou tipo físico.

## Validações

- Chromium com PostgreSQL real e hub sintético: a conta exclusiva `fixture-view`
  permite views e recusa tabelas, sem ampliar as contas existentes do harness.
  A view sintética `public.orders_view` lê pedidos do banco privado. Publicação
  como tabela é recusada na consulta pela policy; escolher view, republicar e
  conceder explicitamente permite retornar `10.25`.
- A releitura conserva `view`. O token da publicação anterior não recebe a
  capacidade nova; a tentativa é recusada antes de entregar dados. Essa extensão
  dirigida passou em **8,6 s**. O caso inicial havia passado em 8,0 s; são
  verificações sobrepostas, não dois cenários independentes.
- **Quatro percursos Chromium aprovados em 21,6 s**: view, jornada com duas bases,
  limpeza de parâmetros e N:N. A extensão de token anterior foi acrescentada
  depois, sem nova mudança de runtime. Não é uma repetição integral da suíte.
- **47 testes unitários** de treinamento, consulta e policy aprovados, 1,71 s;
  **86 testes web** aprovados. Tipos, lint e builds passaram.

O terceiro login e a view existem somente no harness. A inspeção sintética não
foi ampliada para comprovar constraints de views. A prova PostgreSQL do navegador
não certifica views nativas pela cadeia dos três motores.

## Candidato e baseline persistente

Imagem local nova `se7e-persona-v2:manual-views-20261023`, ID
`sha256:a7ee30b84741bed41642896d19bf365b4a154bff278f6f3aa940f60a6539ea1f`.
O build conferiu TypeScript 7.0.2 e empacotou servidor/worker/frontend. Não foi
publicada. O candidato da [consolidação anterior](2026-10-23-training-candidate-consolidated.md)
conserva seu alcance; não herda esta alteração automaticamente.

Baseline com tabelas e parâmetros, pela imagem nova, fixture
`se7e_persona_66b87a16df15_test`: **2 testes aprovados em 43,84 s**, de
16:41:42 a 16:42:27 UTC, sem mudança dos inventários. Inclui criação de persona,
três fontes, treinamento, releitura, publicação, tokens distintos, consulta
parametrizada, vazio, recusa e revogação. Não consulta uma view nativa nos três
motores e não substitui a matriz ainda pendente de views.

| Projeto | Commit-base                                | Snapshot SHA-256                                                   | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `4bf87a0cdbde7c6ac596920dfe380fe25d06c7478bec7e838b52e866a2b7497e` | 1115     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `354ba458b99a71231598651ddc844f355b79f3bed60e586682092cd38112a43c` | 2718     |

Snapshots locais não são commits. Ambiente Windows, Node 24 local, hub Prisma,
companions de fixture com cofre próprio e drivers nativos dedicados em PostgreSQL,
SQL Server e SQL Anywhere. Não recertifica o agente instalado ou todas as versões
de motores/drivers. A extensão posterior do teste Chromium não mudou runtime ou
imagem e mantém evidência separada do inventário do baseline.

## Limpeza e limites

Bancos filhos Chromium foram removidos pelo teardown. Após a parada limpa de
servidor/worker/companions, o procedimento com escopo/propriedade verificados
removeu somente a fixture indicada. Nenhuma base ou credencial operacional foi
utilizada. Os avisos conhecidos do SDK e do build permaneceram visíveis.

Deploy/publicação seguem bloqueados, `ready:false`, nenhum dos treze gates
promovido. Não houve commit ou push. HTTPS/ChatGPT e demais aceites continuam
manuais ou pendentes conforme o [plano](../remaining-plan.md).
