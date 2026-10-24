# Bootstrap compilado com hub persistente — 2026-10-23

## Resultado e escopo

O aplicativo compilado da [rodada privada](2026-10-23-agent-private-runtime-package.md)
passou no bootstrap configurado e no reinício contra um hub real com
Prisma/PostgreSQL de fixture. O controlador usou exclusivamente a prova explícita
do aplicativo e um workspace temporário protegido, sem perfil operacional.

Nas duas fases foram verificados:

- Primeiro frame e inicialização do núcleo, com operações SQL desabilitadas.
- Uma configuração privada; integridade SQLite por `quick_check`.
- Roundtrip do cofre DPAPI e ausência de credenciais em texto no registro SQLite.
- Renovação automática da sessão do hub e restauração da credencial ODBC sintética.
- Mesmos IDs de configuração e instância após reinício, com novo ID de sessão.
- `rpc.discover` pelo REST autenticado do hub e pelo RPC do agente compilado.
- Parada cooperativa, código zero e confirmação `boot-closed` em ambas as fases.

Não houve SELECT/DML de negócio. O perfil configurado usa uma conexão sintética
inacessível em loopback para evitar uso de fonte operacional. Esta rodada não
repete consultas nos três motores, não executa o instalador e não valida serviços
SCM. O resultado usa `installationPerformed:false` e `installedState:not_checked`.

## Implementação e falhas preservadas

`scripts/homologation/native-desktop.ts` exige fixture nova privada, hub Prisma,
prova de build e Python concretos. Não retoma rodadas anteriores. A entrada do
agente `tool.updater.bootstrap_fixture_input` verifica a prova duas vezes antes
de criar o workspace e aplicar sua ACL; devolve somente metadados.

O alias Python da Microsoft Store foi recusado por `realpath` antes de iniciar o
teste. A repetição usou o Python concreto do runtime disponível, versão 3.12.14.
Não houve instalação de dependências.

A primeira rodada com o aplicativo chegou ao bootstrap, mas falhou no parser do
controlador: ele esperava `response.result`, enquanto o REST normaliza a resposta
em `response.item`. Essa falha não foi atribuída ao agente nem apresentada como
aprovação. Seus processos encerraram limpos e a infraestrutura foi removida.

A correção exige envelope `single`, os dois indicadores de sucesso e documento
OpenRPC não vazio. HTTP 200 com erro normalizado é recusado. Três testes cobrem o
contrato; a repetição integrada utilizou uma fixture nova.

## Rodada aprovada e revisões

Período UTC: **2026-10-23 13:17:43–13:19:09**. Infraestrutura:
`se7e_persona_641afb303249_test`; sessão:
`chain-7c352d3f4ec04f5892b93cd4c6b9ca34`.

O binário foi compilado do commit **c1f21e992eb82ef1843fea007d671a972f371b6b**,
com recibo SHA-256
`65aba97624f77c9b0c2e5bb1b7bedb1661e6988a3c04ae01657f92748e1dd516`.
Não incorpora mudanças posteriores do checkout do agente.

O inventário dos controladores/checkouts permaneceu igual antes e depois:

| Projeto | Commit-base                                | SHA-256 dos arquivos locais                                        | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `52fb7450bddcf2517e0d7e05fdaac760c46ee20a1ca88d77260158173d548f9c` | 1111     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `ee23b4a2597040d669f7e3c71ca47d9cdbeb5ad8447663ec3692ed329e74e2b7` | 1024     |
| Agente  | `e992cbaa35fef6c764dfea4a1dab9550bff66f59` | `2cdf8f7f658113b5f6ae9df0cacde2c1a28a8af4ce270eaa86bd65af5c8b4626` | 2709     |

Registro local:
`node_modules/.cache/persona-chain-sources-3f8387ddeee24644b538be0a2eaee20d.json`.
O commit-base não substitui o snapshot; o inventário do agente não certifica um
build desktop dessa revisão posterior. Documentação acrescentada após a rodada
não é recertificada retroativamente.

## Verificações e limpeza

- Duas fases reais aprovadas: `cold` e `restart`, com descoberta RPC em cada uma.
- **116 testes** de tooling do agente aprovados, sem omissões, em 16,845 s.
- **14 regressões** do workflow aprovadas, sem omissões, em 0,191 s.
- **3 testes** do contrato normalizado aprovados, sem omissões.
- Lint geral do MCP, lint dirigido ao controlador, tipos e formatação aprovados.

Após confirmação efetiva de fechamento dos processos, foram removidos os
containers, volumes/DSN e servidor SQL Anywhere pertencentes à fixture, pelo
limpador com verificação de propriedade. O workspace DPAPI temporário também foi
removido após conferir seu alvo absoluto. Foram preservados somente metadados
da rodada em `node_modules/.cache/native-desktop-passed-metadata.json`, além do
inventário de fontes. Credenciais, banco do perfil e logs privados não foram
copiados para a documentação. A rodada falha conserva seu registro de resultado
e metadados, sem infraestrutura em execução.

## Pendências

Atualização/recuperação instaladas, condições administrativas e aceite humano
continuam pendentes. A sessão manual de treinamento e a cadeia dos três motores
têm suas evidências próprias. HTTPS/ChatGPT permanecem para validação manual.
Não houve commit, push ou deploy por esta tarefa; nenhum gate foi concluído e
`ready:false` permanece obrigatório.
