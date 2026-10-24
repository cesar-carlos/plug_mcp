# Conciliação externa e adapters isolados — 2026-10-15

Evidência local de desenvolvimento. `ready: false`; nenhum gate encerrado.
HTTPS público e instalação/conversa ChatGPT permanecem para validação manual.

## Entrega

Leitura de conciliação REST GET/MCP remoto fixada em novas publicações, vinculada
à chave original e ao contrato concedido. Evidências append-only ficam separadas
do estado e receipt técnico. Ausência, duplicidade, incompletude, divergência,
estado não confirmado e falha são inconclusivos, sem reexecução.
Migration aditiva 0026; migrations anteriores preservadas.
[Contrato e limites](../external-integrations.md#conciliação-por-evidência-treinada).

## Ambiente e alcance

Node 24.21.0, TypeScript real 7.0.2 e PostgreSQL 17.11 em contêiner dedicado,
com banco próprio e manifesto local ignorado. Provedores REST e MCP de teste
usam HTTPS nativo, certificado de fixture, JSON/SSE e ledger sintético em arquivo
temporário próprio. Destinos públicos virtuais são mapeados por injeção somente
no teste; produção não tem configuração para ignorar DNS/TLS/porta pública.

MCP HTTP real da composição v2 → serviços/autorização → journal PostgreSQL →
adapter → provedor TLS local. Responsável/hub são sintéticos; não há SQL de negócio
nessa cadeia externa. Não substitui homologação SQL MCP → hub → agente, DNS público,
Redis distribuído, reinício real de processos ou validação no ChatGPT.
Reabertura exercitada é da composição/runtime contra o mesmo banco, e não queda
forçada do processo ou restauração do provedor. Nenhuma fonte ou credencial do
usuário foi usada. Inventário do candidato local em
[external-reconciliation-candidate.json](external-reconciliation-candidate.json).

## Validações

- PostgreSQL: **50/50**, 22,63 s, baseline novo e reaplicação. REST e MCP percorrem
  publicação pelo runner, concessão, preparação MCP, perda da resposta após efeito,
  reabertura, conciliação MCP e recusa de novo envio. Ledger comprova uma única
  ação de consumo, separada da ação do runner. Casos de ausência, duplicidade,
  parcialidade, chave divergente, estado pendente, resposta inválida, schema MCP
  alterado e revogação durante leitura conservam receipt e estado. Constraints
  recusam alteração de evidências e fingerprint divergente. Contratos antigos
  não adquirem consulta de conciliação. Não há skip de aceite.
- Adapters/domínio/TLS: **10/10**, incluindo chave composta e contratos recusados.
  Regressão persona-v2 e pacote básico: **509/509**, 48 arquivos, 27,07 s.
- Console: lint, tipos, **32/32** testes e build. Dependências ausentes foram
  restauradas offline pelo lockfile; nenhuma versão alterada. O detalhe apenas
  apresenta evidência já registrada. Jornada Chromium anterior não foi apresentada
  como nova avaliação desta mudança de texto.
- Tipos, lint e build do servidor passaram. Validação offline adicional do pacote
  privado: **24/24**. `docs:check`: 120 arquivos, 789 links e 13 gates, sem problemas.
  Node/compilador e `training:check` passaram; pin/contrato do hub preservados.
  Guard de release recusou publicação conforme esperado.

O primeiro teste no sandbox falhou por temporários inacessíveis e TLS local
bloqueado; repetição autorizada fora do sandbox passou. Não houve relaxamento do
validador, de TLS nativo ou de autorização. Referência do hub não foi alterada;
seu benchmark/CI continua uma evidência independente.

## Pendências

Runner CLI, importação OpenAPI, descoberta/editor administrativo, gestão completa,
retenção e worker externos continuam pendentes. Evidência do serviço corresponde
somente à garantia treinada; não é prova independente de todos os efeitos de negócio.
Não há retry automático ou resolução presumida do resultado desconhecido.

Fixture PostgreSQL e manifesto com credenciais foram removidos, conferindo nome
e rótulo. Zero diretórios de ledger dessa família permaneceram no temporário.
Nenhuma publicação/deploy autorizado.
