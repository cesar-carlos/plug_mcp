# Persona-v2 — estado da refatoração

Continuação local de 2026-10-26: guia compartilhado e comparação de compatibilidade
do plugin, combinação explícita de datasets e importação direta para cruzamentos.
Ver [evidência e limites](validation/2026-10-26-plugin-improvements.md).
A validação no ChatGPT aguarda conexão sintética dedicada; não há novo deploy
ou aceite integral decorrente desta rodada.

Primeiro servidor de teste: [escopo, lacunas concretas e ordem de implementação](first-test-deploy.md). DV2-017 permite validar e ajustar no destino, sem aceite manual prévio. O caminho separado de liberação de teste está implementado com contrato e imagem próprios; o manifesto integral continua bloqueado e não representa aceite fictício.

Contrato ativo: persona central, várias fontes, conhecimento publicado e tokens
com concessões explícitas. O percurso prioritário é **criar persona → cadastrar
bases → treinar → publicar → conceder permissões → conectar → consultar**.

A entrada principal e a distribuição padrão agora usam v2. O servidor de teste
tem liberação técnica própria; **aceite integral para clientes permanece
bloqueado** pelo [manifesto](../../contracts/persona-v2-release.json).
Motores vigentes: PostgreSQL, SQL Server e SQL Anywhere. Firebird é histórico.

## Como consultar a documentação

| Necessidade                                    | Referência canônica                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Comportamento aprovado e decisões substituídas | [Decisões](decisions.md)                                                               |
| O que falta implementar ou homologar           | [Plano restante](remaining-plan.md)                                                    |
| Critérios para encerrar cada gate              | [Matriz de aceite](acceptance.md)                                                      |
| Resultados de uma revisão específica           | [Índice de evidências](validation.md)                                                  |
| Iniciar treinamento manual em bases sintéticas | [Sessão local e parada](homologation-chain.md#sessão-contínua-para-treinamento-manual) |
| Procedimentos e contratos por subsistema       | [Índice geral](../README.md)                                                           |

Relatórios históricos não certificam alterações posteriores. Não somar contagens
de rodadas nem interpretar implementação local como aceite de produção.
HTTPS público e instalação/conversa no ChatGPT podem ser exercitados no destino;
validação manual prévia e aceite funcional humano estão dispensados, não aprovados.

## Modelo aprovado

Avaliação separada da IA: [contrato e execução do avaliador v2](consumer-evaluation.md).

- Responsável identificado por origem do hub e Client, com sessão administrativa.
- Persona existe sem fontes e possui especialidade, instruções e skills.
- Cada fonte tem credencial própria e identidade confirmada pelo hub/agente.
- Conhecimento compartilhado exige catálogo autorizado e versões publicadas.
- Skill publicada fixa treinamento, dependências e limites; rascunho não executa.
- Token e eventual consentimento OAuth limitam as capacidades do consumidor.
- SQL de negócio segue exclusivamente MCP → plug_server → plug_agente.
- Conhecimento não concede autoridade; aprovação humana não amplia permissões.

## Implementado em desenvolvimento

| Área                     | Alcance entregue e contrato                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persona, fontes e tokens | Criação sem fonte, múltiplas bases, ciclo explícito, credenciais, concessões e administração delegada limitada. [Onboarding](onboarding.md).                          |
| Conhecimento             | Inspeção, compatibilidade, padrões/perfis, curadoria, busca/grafo, feedback e revisão temporal. [Conhecimento compartilhado](shared-knowledge.md).                    |
| Biblioteca editorial     | Templates, datasets, sementes SQL por consulta ou importação direta e DDL declarativo, sem executar arquivos ou herdar aprovação. [Biblioteca](knowledge-library.md). |
| Treinamento e publicação | Rascunhos, casos/relatórios, preview/hash/CAS, prazo humano e publicação imutável. [Catálogo](catalog.md).                                                            |
| Consultas e cruzamentos  | Fontes explícitas, campos/finalidades, limites redutíveis, combinação tipada e proveniência. [Consultas](source-queries.md), [cruzamentos](federation.md).            |
| Operações SQL            | Preparação, aprovação, journal, execução transacional e conciliação sem reenvio incerto. [Operações](sql-operations.md).                                              |
| Integrações              | Cadastro/gestão, descoberta MCP, importação OpenAPI, contratos publicados, consulta, ações e conciliação. [Integrações](external-integrations.md).                    |
| Conexões                 | Bearer, OAuth próprio, setups temporários e pacote privado validado localmente. [OAuth](oauth.md), [plugin](plugin.md).                                               |
| Console                  | Editores dos quatro tipos de skill, casos, publicação, preparações, execução autorizada, diagnóstico e histórico. [Console](console.md).                              |
| Cache e anexos           | Cache/singleflight isolados, Redis, anexos JSON/binários cifrados e revalidação. [Cache](query-cache.md), [anexos](attachments.md).                                   |
| Manutenção               | Worker, leases, revisão, temporários, retenção, rotação de chaves e outbox. [Worker](review-worker.md), [cofre](vault-rotation.md), [outbox](outbox.md).              |
| Distribuição             | Imagem candidata, migrations explícitas, reset restrito e verificações de evidência. [Candidata](candidate-distribution.md), [liberação](release-evidence.md).        |

Essas capacidades têm limites documentados. Jornadas administrativas restantes,
matriz ampliada, instalação real e aceite final continuam no plano restante.
Não é uma declaração de conclusão dos subsistemas ou dos gates.

O console também oferece navegação agrupada, edição recolhida, aparência por
persona com descarte e recuperação de conflito, e galeria local de mascotes.
O [contrato da interface](console.md) separa escolha de imagem, salvamento e
downloads para uso manual no cliente. Essas capacidades não mudam permissões
nem configuram automaticamente a aparência no ChatGPT.

## Uso de desenvolvimento

Configure um **banco MCP novo e dedicado** em DATABASE_URL. Nunca apontar a entrada
nova ao banco do hub, agente ou ERP. O runner não limpa nem converte bancos.

```sh
npm run db:migrate:persona-v2
npm run web:build
npm run dev:persona-v2
```

Aplicação principal, `worker`, Docker padrão e `db:migrate` agora usam v2.
Legado tem entradas explícitas para regressões. Ambos os conjuntos de migrations
são preservados; somente o runner escolhido executa seu conjunto. Não reutilizar
um banco legado na nova entrada.

Os contratos administrativos, campos de cadastro e regras de sessão ficam no
[onboarding](onboarding.md). Para operar pela interface, consulte o
[console](console.md). Credenciais entram somente no navegador; não devem ser
enviadas à IA. A referência da API não é duplicada neste resumo.

## Banco e constraints

Migrations em `migrations/persona-v2` são independentes do legado. Runner aceita
banco vazio ou geração v2 completa, com lock/checksum. Não alterar migration aplicada.

Chaves compostas preservam persona/fonte. Publicações e dependências são imutáveis;
suspensões ficam fora do snapshot. Aprovação vincula responsável e hash.
Tabelas previstas para integrações, OAuth ou setup não significam serviços ligados.
A migração 0005 suspende fontes anteriores sem prova nativa e suas dependências.

## Pendências para aceite integral

A [matriz de aceite](acceptance.md) relaciona cada gate do manifesto ao que já
está implementado e à evidência exigida. Todos permanecem pendentes de aceite
integral. Os [relatórios por rodada](validation.md) registram resultados parciais.

O [trabalho restante](remaining-plan.md) lista só o que falta, com dependências.
Não altera o estado dos gates. Alterar documentação ou executar docs:check não
aprova um gate.

## Verificação

```sh
npm run test:persona-v2
npm run test:persona-v2:postgres
npm run test:persona-v2:browser
npm run typecheck
npm run lint
npm run build
```

Suítes PostgreSQL/browser exigem PERSONA_V2_TEST_DATABASE_URL explícita, fixture
com sufixo _test e permissão de criar bancos próprios aleatórios; sem fallback a
DATABASE_URL operacional nem skip por ambiente ausente.

Resultados datados e alcance: [validação](validation.md). Não copiar contagens
históricas para o estado atual nem interpretar harness sintético como aceite.
