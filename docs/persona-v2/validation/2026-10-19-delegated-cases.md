# Casos e relatórios delegados — 2026-10-19

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Sem alteração de contrato público do hub ou migrations.

## Entrega

Tools `obter_testes_skill` e `editar_caso_skill` e GET/POST de testes nas rotas
administrativas Bearer/OAuth conectam os serviços existentes de operação SQL e
cruzamento. Exigem treinar, fontes concedidas e delegação/consentimento atuais.
Edição usa schema compartilhado e revisão; não há dispatch, execução de runner,
gravação de relatório, publicação ou aprovação humana por esses caminhos.

## Verificação

- Suíte PostgreSQL de setup/delegação: 69 testes aprovados, sem omissões, em
  29,04 segundos. Hub/autenticação são fixtures, não instalação remota.
- Novo cenário MCP/HTTP: leitura inicial, criação, conflito CAS, leitura HTTP,
  remoção HTTP, tipo/ID inválidos e revogação remota recusada; nenhum relatório
  técnico criado pela edição. Descoberta MCP inclui as novas tools para treinar.
- Após acrescentar fonte não concedida, repetição dirigida passou: leitura e
  edição recusadas. Os outros 68 casos foram filtrados nessa repetição, tendo
  passado na rodada completa anterior.
- Tipos, build backend e lint afetado aprovados. A primeira execução do novo
  caso recebeu 403 por ausência de Origin na fixture HTTP; corrigido o teste,
  sem relaxar a validação de origem.

PostgreSQL 17 Alpine exclusivo, banco-base `persona_delegation_test` e banco
aleatório criado/removido pela suíte. Não usou fonte operacional ou SQL de negócio.
Contêiner e volume anônimo removidos após conferir ID e rótulo exclusivo da rodada.

## Limites

O novo cenário de transporte usa Bearer e operação SQL. A matriz completa do novo
transporte OAuth e cruzamento, concorrência em trânsito e instalação nos três
motores continua no aceite; os serviços reutilizados preservam seus controles.
Não equivale a avaliação da IA, certificação do plugin ou aceite de produção.
HTTPS e ChatGPT manuais, deploy bloqueado e nenhum gate encerrado.
