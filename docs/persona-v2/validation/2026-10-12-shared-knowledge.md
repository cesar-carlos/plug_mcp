# Fundação do conhecimento compartilhado — 2026-10-12

Rodada da entrada de desenvolvimento persona-v2, com alterações locais anteriores
preservadas e sem commit, push, publicação de imagem ou deploy. HEAD MCP:
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`. O HEAD sozinho não identifica este
candidato; hashes dos componentes exercitados estão abaixo.

Contrato: [DV2-008](../decisions.md#dv2-008--conhecimento-compartilhado-por-padrão-e-base),
[conhecimento compartilhado](../shared-knowledge.md) e [matriz de aceite](../acceptance.md).
O padrão Data7 não foi inventado ou preenchido com dados presumidos. Exemplos,
estrutura e conteúdo desta rodada são fictícios e destinados somente aos testes.

## Implementação exercitada

- Catálogos privados, concessões explícitas por hubOrigin/client.id e papéis
  administrador, curador, colaborador e leitor. Somente administrador altera membros;
  colaborador não publica. Revogação impede leituras diretas subsequentes.
- Rascunhos por CAS, preview de 15 minutos vinculado ao curador, revisão, autorização,
  conteúdo e publicação anterior. Confirmação de uso único e concorrência serializada
  por catálogo impedem duas publicações de previews independentes da mesma revisão.
- Snapshots imutáveis, suspensão separada e histórico de 20 versões por página,
  com cursor restrito ao catálogo/padrão. Leitores não recebem rascunhos ou versões
  suspensas, inclusive pela comparação ou pelo cursor.
- Comparação por identidade lógica: entidades, campos, significados, classificação
  e SQL por dialeto; ordem de chaves/caminhos preservada. Comparar não decide
  compatibilidade nem altera versões de fontes/skills.
- Tipos lógicos e representações nativas, precisão/escala/comprimento, chaves
  primárias/únicas, estado declarado, unidades/moedas/calendário e relacionamentos
  de negócio/banco. Caminho N:N exige relações diretas ordenadas e intermediárias
  existentes. Importação não produz prova técnica nem confirma significado.
- Vários exemplos parametrizados por dialeto, todos validados por AST, escopo e
  fanout, inclusive inativos. N:N via intermediária não vira JOIN direto implícito.
- Skills privadas aceitam exemplos adicionais, fixados no contrato publicado e
  entregues em `obter_skill`. Edição de rascunho preserva conteúdo ativo.
- Console cria catálogos, importa JSON sem executar conteúdo, salva/revisa/publica,
  consulta/compara versões, suspende e administra membros. Confirmação de descarte
  protege edição pendente ao criar/trocar catálogo. Confirmação de publicação exige
  revisão explícita; conhecimento compartilhado ainda não é adotado pela fonte.

## Banco e isolamento

Migrations novas `0006_shared_knowledge.sql` e `0007_shared_preview_authority.sql`.
Nenhuma migration aplicada anteriormente foi editada. A segunda acrescenta o vínculo
ao predecessor e expira previews anteriores, sem fabricar uma vinculação válida.

O teste de upgrade constrói uma geração v2 até 0006, com skill/publicação privadas
e preview compartilhado anterior, aplica o runner atual duas vezes e verifica:
treinamento privado e publicação ativa intactos; ausência de promoção automática;
preview antigo expirado; reexecução idempotente. A suíte também verifica baseline,
checksums/readiness e recusa de legado sem DDL, conforme os testes existentes.

Fixtures próprias com sufixo `_test`, container `persona-knowledge-<UUID>`, porta
local dinâmica e senha aleatória. Todos os containers criados nesta rodada foram
removidos pelo `finally`; o PostgreSQL preexistente permaneceu intacto. Não foram
usadas fontes cadastradas, credenciais operacionais ou armazenamentos do hub/agente.

Windows/PowerShell, Node **24.21.0**, TypeScript **7.0.2**, pg **8.23.1**, Playwright
**1.63.0**/Chromium e PostgreSQL **17.11**, x86_64 Alpine/musl, gcc **15.2.0**.
Imagem local `postgres:17-alpine`, ID/digest observado:
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.

O PostgreSQL de controle e as duas fontes sintéticas do navegador são reais.
Autenticação/perfil do responsável e gateway do hub são fixtures, sem transporte
real do agente nesta rodada. A composição normal continua usando plug_server;
não foi criado acesso direto do MCP aos bancos de negócio.

## Resultados finais

| Verificação                    | Resultado                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `node:check`, `compiler:check` | Node 24 e TypeScript 7 reais aprovados                                          |
| `typecheck`, `lint`, `build`   | Aprovados                                                                       |
| `training:check`               | Contrato fixado e base legada aprovados, sem alterar sua autoridade             |
| `test:persona-v2`              | 248 aprovados, incluindo dez casos de estrutura/diff/exemplos                   |
| `npm test`                     | 1.130 aprovados; 91 opcionais omitidos pela configuração existente              |
| `test:persona-v2:postgres`     | 86 aprovados em sete arquivos; oito cenários de conhecimento compartilhado      |
| `test:persona-v2:browser`      | Seis cenários aprovados no Chromium, incluindo catálogo, comparação e suspensão |
| `web:check`                    | Lint, tipos, 23 testes e build aprovados                                        |
| Formatação e `docs:check`      | Arquivos tocados, links, exemplos e cobertura dos 14 gates aprovados            |
| Guard de release               | Recusou publicação com exit 1, como exigido                                     |

As contagens de subconjuntos não devem ser somadas às da suíte geral. Omissões
opcionais não substituem homologação obrigatória. A rodada inicial encontrou uma
expectativa antiga de versão do guia e tratamento de sessão revogada; expectativas
foram atualizadas. A fixture reutiliza sessões para respeitar o limite real de
logins, sem enfraquecer a proteção de produção. Temporários foram direcionados ao
workspace após `ENOENT` do sandbox; nenhuma assertion foi removida para passar.

## Identificação do candidato

SHA-256 de arquivos relativos à raiz MCP:

| Arquivo                                                         | SHA-256                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/domain/persona-v2/shared-knowledge.ts`                     | `df8fdeeb1cfd74cb09dd03d23032470e130072e811cc9f40e42550da546b1373` |
| `src/application/persona-v2/shared-structure-schema.ts`         | `bbdcb550522e4bba43fd287c37b344047b9fa9f17ea68e8695c97f101b4a7112` |
| `src/application/persona-v2/shared-structure-diff.ts`           | `62048798c6fbe245781b6b0535b43f3c7d39a32ca688f02c92d4d0f74f989381` |
| `src/application/persona-v2/shared-knowledge.ts`                | `033596cb333a2531dfcf4bf0a64288dd9ac12f682a1deda30a6437999c6d4278` |
| `src/infrastructure/persistence/persona-v2/shared-knowledge.ts` | `f5c5ee3f1c03d433798fe42ca15515f3469a4352454e92833a279acc665aab16` |
| `src/application/persona-v2/query-training.ts`                  | `5e59ad2802bab4707c9c42eec2bed13473538e65cebfa341ad4e3f153fab6300` |
| `src/application/persona-v2/consumer-catalog.ts`                | `3f1179693175f64455a7bf43f59d044b25d4b44a1b05f4856eb69cf1399b8369` |
| `src/application/persona-v2/training-base.ts`                   | `bc9a0afc0dab5d05586db540e154596689492245aec172f0ebcfb44d316857d3` |
| `migrations/persona-v2/0006_shared_knowledge.sql`               | `835d1eb621fd2ca1fafdd3f20f356a51adf6c03cbc90e3a109014476dd477e0d` |
| `migrations/persona-v2/0007_shared_preview_authority.sql`       | `d0f635f96a5635b0b50d0666bbc6fc859bcaa25f444c4093d43aee3fa3e15e63` |
| `web/src/persona-v2/SharedKnowledgePanel.vue`                   | `726bca8de49dd15965f15f7a7c69b91438c006b1b15f39af438f7fc8f2fa5b35` |
| `tests/persona-v2/shared-knowledge.postgres.test.ts`            | `df1914a7c79799a4004afcf587b6209d3348ade82f83c8f621f831b8e67d5134` |
| `tests/persona-v2-browser/persona.spec.ts`                      | `5238444fc86fd4dfb2c56c50b5a9fb7f5fb735dc82c3f1dfdddc030a4d560cbc` |
| `contracts/persona-v2-release.json`                             | `212dc6bb71232a8bdb8ffe57e5ac78cd21c152b5383ef8689d3c8df55ed0cbcd` |

## Limites e continuidade

Esta rodada entrega a fundação administrativa do catálogo, não a conclusão do plano.
Permanecem pendentes `sql.describeSchema`/`sourceSchema` v1 nos quatro motores,
prova da estrutura na conexão executora, perfis físicos e curadores com acesso
vigente, vínculos fonte/versão/compatibilidade, dependências publicadas, adoção
testada, propostas/revisões completas e tools MCP compartilhados autorizados.

Não foram implementados nesta rodada administração por token/delegação no hub,
privacidade por campo/uso, runners genéricos dos quatro motores, integrações externas,
OAuth/setup v2, cache/anexos/worker/retenção, demais jornadas e distribuição/corte.
As entregas anteriores mantêm seu alcance documentado, sem serem rehomologadas
automaticamente pela suíte PostgreSQL desta rodada. Não houve avaliação da IA
consumidora, nem homologação persistente integral dos três projetos/quatro motores.

O MCP agora exige **14 gates**, incluindo `shared-knowledge-and-compatibility`.
Hub e agente mantêm seus **13 gates** anteriores. Os três manifestos continuam com
**`ready: false`** e **`completedGates: []`**. Nenhum gate recebeu aceite e o deploy
continua bloqueado. A próxima dependência do conhecimento executável é a inspeção
e a conferência estrutural pelo hub/agente, conforme o [trabalho restante](../remaining-plan.md).
