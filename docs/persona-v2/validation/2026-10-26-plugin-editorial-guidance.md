# Revisão das instruções do plugin — 2026-10-26

Checkout local sobre `f521585d40e9a844984b143101b928676614d519`, com alterações
acumuladas sem commit. Windows, Node 24.21.0.

Aplicada a skill instalada `plugin-creator:update-plugin`, com as referências
de formato e componentes. O projeto segue o caminho de MCP hospedado separadamente:
repositório e distribuição próprios, preservando identidade e conexão existentes.

A skill empacotada de treinamento v2 agora distingue edição delegada de consultas
e edição exclusiva no console Client de casos SQL/cruzamentos vinculados a datasets.
Inclui importação direta SQL, limites de origem e ausência de aprovação herdada.
Não adiciona ferramentas, modifica permissões ou altera a geração legada.

Validação: 39 testes aprovados de montagem/validação de pacotes em dois arquivos,
com variantes exclusivas, inventário, referências e recusas de entradas inválidas.
`docs:check`, Prettier e `git diff --check` passaram. Os identificadores sintéticos
usados pelas fixtures não foram distribuídos como conexões reais.

Sem publicação, atualização na conta, deploy ou nova instalação no ChatGPT.
Esses testes não comprovam comportamento do modelo ou conexão no cliente real.
