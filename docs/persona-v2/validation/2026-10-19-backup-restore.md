# Backup e restauração de fixture v2 — 2026-10-19

## Revisão e ambiente

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Imagem local linux/amd64 `se7e-persona-v2-candidate:worker-health-local`, ID Docker
`sha256:41d87c74e20bed9b376526884d8668d732081f279c7ed4d2beea681f6d5bb309`.
Scripts de fixture montados somente para leitura, fora da imagem:

- `candidate-backup-fixture.mjs`: SHA-256 `59d90b57a34fda66aed750fd55be232beeae6279493444fa8f1e7bd1c8f867c8`.
- `test-persona-candidate.ps1`: SHA-256 `9a9204b61b81a7c35389e2d89554f18e4decc21e81336965a62a150e6179bfec`.

## Resultado

Ensaio empacotado aprovado após extensão do harness. Usa PostgreSQL 16 Alpine e
Redis exclusivos, projeto aleatório e hub propositalmente inválido, sem rede de
negócio. Não modificou migrations, contrato público do hub ou runtime.

1. Aplicou/reaplicou quarenta migrations; semeou oito registros sintéticos de
   armazenamento, incluindo token revogado, integração inativa, snapshot publicado
   e journal desconhecido com payload cifrado. Não são casos de negócio publicados.
2. Parou servidor/worker, com exit code zero do worker; criou dump customizado e
   restaurou em banco novo com transação única, preservando o banco original.
3. Comparou digest de todas as colunas das oito linhas. Credencial/payload foram
   descriptografados com a chave de fixture; chave incorreta foi recusada.
4. Confirmou token ainda revogado, journal ainda desconhecido/sem prazo terminal,
   e triggers que recusam alterar publicação, reabrir ou apagar o journal.
5. Iniciou servidor/worker sobre o banco restaurado. Saúde e quatro jobs passaram;
   nova parada limpa e nova comparação confirmaram preservação dos registros.
6. Preservou os testes anteriores de produção/legado/checksum recusados, startup
   sem DDL e assets. Cleanup confirmou remoção dos contêineres, volumes e arquivo
   temporário próprios; dump permaneceu apenas no contêiner descartável.

`node --check` passou no script de fixture. Os 29 testes dirigidos de configuração
e artefato passaram; não substituem o ensaio PostgreSQL acima. A primeira rodada
passou antes das verificações adicionais de chave incorreta e preservação após
jobs; a rodada final repetiu o harness completo com ambas e passou.

## Limites

Não prova backup instalado, armazenamento externo, recuperação em outra máquina,
papéis/grants globais, rotação de chaves anteriores, RPO/RTO, sessões OAuth ou
anexos restaurados. Não houve dispatch de SQL/ação nem restauração do agente/hub.
Os registros são fixtures de persistência, não aprovação semântica de treinamento.

Uma restauração pode perder eventos posteriores ao snapshot, inclusive revogações
e confirmação de efeitos. Ausência no backup não autoriza reenvio; é necessário
reconciliar antes de reabrir acesso. Restaurar MCP não desfaz lançamentos externos.
HTTPS e ChatGPT continuam manuais. `ready: false`, sem gate encerrado, commit,
push, publicação ou deploy.
