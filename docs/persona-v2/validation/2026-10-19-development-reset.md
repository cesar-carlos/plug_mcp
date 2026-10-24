# Reset local de desenvolvimento — 2026-10-19

## Entrega

CLI separado, sem `.env` ou fallback de DATABASE_URL, com URL própria, ambiente,
geração e confirmação explícitos. Aceita apenas banco local nomeado e marcado
descartável pelo operador. Simulação é padrão. Trunca dados em transação mantendo
schema, geração e migrations. Sem DROP DATABASE, CASCADE ou chamadas hub/agente.
[Contrato e limites](../development-reset.md).

## Verificação

- Onze testes unitários de alvo: ambiente ausente/produção, outra geração,
  confirmação divergente, URL ausente/remota, parâmetros de conexão, banco de
  sistema, hub e nome incompatível recusados.
- Um cenário PostgreSQL integrado, repetido após ampliação, aprovado. Cobre
  legado preservado, ausência da marca, tabela desconhecida, outro schema,
  checksum alterado e conexão concorrente recusados; simulação por serviço e CLI
  preserva registros; aplicação limpa dados; falha AFTER TRUNCATE provoca rollback;
  verificação/reaplicação de migrations e repetição com banco já limpo passam.
- Typecheck, lint dirigido, build e docs:check aprovados. Sem execução da suíte
  integral; este comando atua no PostgreSQL de controle, não nos motores ERP.

## Ambiente e limpeza

PostgreSQL 17 Alpine em contêiner local exclusivo, porta loopback aleatória e
banco com UUID. O teste cria e remove somente seu banco; ao final, contêiner e
volume da rodada foram removidos após conferir ID e label. Nenhum segredo ou
registro operacional foi utilizado. Fonte funcional identificada no
[inventário SHA-256](2026-10-19-development-reset-files.json).

O operador deve manter aplicações paradas; marca/nome não descobrem o ambiente
real nem autorizam um túnel para produção. O comando não substitui backup,
conciliação ou corte. Distribuição/corte e aceite integral continuam pendentes.
Manifesto permanece ready:false; HTTPS e ChatGPT continuam manuais.
