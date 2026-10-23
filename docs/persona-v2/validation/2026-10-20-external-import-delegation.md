# Descoberta e importação delegadas — 2026-10-20

Suíte setup-delegation.postgres: 79 testes aprovados em 31,91 segundos,
início 11:50:22, sem filtro ou omissões. PostgreSQL 17 em contêiner próprio,
porta loopback, credencial efêmera e bancos de fixture. Limpeza confirmada;
variável de conexão restaurada. Nenhuma fonte operacional utilizada.

O cenário de importação foi ampliado:

- Sem escopo de integração, importação é recusada.
- Após concessão explícita, propor_contrato_externo interpreta OpenAPI por MCP.
- Outra integração não concedida é recusada antes de chamar discovery.
- Listagem editorial retorna somente integrações concedidas.
- Retirar escopo após beforeDispatch impede a entrega dos metadados.
- Descoberta com escopo vigente produz proposta; casos anteriores de credencial
  alterada, autoridade revogada e catálogo incompleto continuam passando.

Authority e discovery são controlados nessa suíte. Não comprova transporte
externo real, OAuth ou autoridade persistente do hub para o caminho novo.
Propostas não foram executadas ou publicadas automaticamente.

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
SHA-256:

- external-integrations.ts:
  A91C96BB6FE5EEDA946185DFF3D2D74CF72C51E95A8BD9F9CFB5F32C5570A620.
- setup-delegation.postgres.test.ts:
  6CCE0BE64F31A9904106C5A2516BF8C7A3EE6988B57823543044FE9C9B18AA39.

A imagem candidata anterior não inclui esta alteração; reconstrução futura
precisa revalidar os caminhos afetados. Deploy bloqueado, nenhum gate encerrado.
