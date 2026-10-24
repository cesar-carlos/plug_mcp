# Ciclo de fontes e bloqueio coordenado de release

Rodada de 2026-10-13, America/Cuiaba. Implementa uma parte da etapa 2 do
[plano restante](../remaining-plan.md) e corrige a divergência dos guards da
etapa 1. Nenhum gate foi encerrado; deploy, imagens e corte continuam bloqueados.

## Candidato

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `570e797b728eafa1cdc950be5e446ab7dd1c497c` |

Checkouts têm alterações locais. Os hashes abaixo identificam os arquivos
centrais desta rodada; HEAD sozinho não identifica o candidato. Não houve
commit, push, publicação de imagens, instalação operacional ou alteração de DNS.
O contrato REST do hub permanece 1.7.0, com snapshot fixado sem alteração.

## Implementação e cenários

- Suspensão de fonte por sessão Client/CSRF/CAS, com suspensão de publicações e
  dependências transitivas e histórico na mesma transação. Outras fontes e
  personas que compartilham a base permanecem independentes.
- Recuperação exige a mesma identidade comprovada pelo plug_server/plug_agente,
  usando credenciais cadastradas ou novas credenciais cifradas. Prova remota
  fora da transação MCP; responsável e CAS revalidados depois. Não remove
  suspensões de publicações nem revogações e não reenvia operações incertas.
- Substituição cria outro vínculo/credencial e preserva o anterior. Duas
  requisições concorrentes criam somente uma substituta. Falha de auditoria
  desfaz cadastro, credencial, mudança do vínculo e suspensões.
- Migration aditiva 0011 impede referências entre personas, reativação de
  vínculo substituído e alteração de sua referência histórica. Upgrade de uma
  instalação 0001–0010 preserva fontes, credenciais, tokens, rascunhos e snapshots
  privados; reaplicação não altera checksums anteriores nem promove catálogo.
- Console apresenta impacto, confirmação, estado histórico e cadastro
  independente. Protege edição/revisão ao navegar; descartar edição antes de
  substituir realmente remonta o formulário anterior. Credenciais são limpas
  por tentativa e erros não refletem valores ou chaves arbitrárias.
- Hub e agente passaram de 13 para os mesmos 14 gates do MCP, incluindo
  `shared-knowledge-and-compatibility`. Remover o gate ou alegar conclusão dos
  outros não autoriza release. Todos mantêm `ready: false` e zero gates concluídos.

## Ambientes e resultados

Controle dos testes PostgreSQL/UI: PostgreSQL 16.13 em contêiner próprio,
porta exclusivamente loopback, sem extensão vetorial. As suítes criam/removem
seus bancos aleatórios. Chromium usa hub sintético e SQL PostgreSQL real.

A cadeia persistente usou novas fixtures dos quatro motores, PostgreSQL/Prisma
no hub, processos MCP/hub próprios, configuração Drift, cofre Windows DPAPI e
journals reais do agente. Negócio acessado somente por MCP/REST/Socket.IO/ODBC.
PostgreSQL 17.11 com psqlODBC 18.00.0000, SQL Server 2022 com ODBC 18,
SQL Anywhere 16.0.0.2043 e Firebird/fbclient WI-V5.0.4.1812. Node 24.21.0 e
TypeScript 7.0.2 verificados pelos scripts do projeto.

| Verificação                                                               | Resultado                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Cadeia persistente dos quatro motores                                     | 21 casos aprovados, 149,35 segundos                     |
| PostgreSQL v2, incluindo upgrade e autorização                            | 146 casos aprovados, 10 arquivos                        |
| Unidades persona-v2                                                       | 263 casos aprovados, 24 arquivos                        |
| Chromium: ciclo móvel/desktop, descarte e percurso de duas bases/consulta | 4 casos aprovados, 390 e 1280 pixels nos casos de ciclo |
| Frontend: lint, tipos, testes e build                                     | Aprovados; 28 testes em 10 arquivos                     |
| Contrato fixado, guard MCP e checker documental                           | 22 casos aprovados em 3 arquivos                        |
| Hub: guard coordenado                                                     | 4 testes aprovados                                      |
| Agente: guard, preflight e publish em fixtures/mocks                      | 49 testes Python aprovados                              |
| MCP: lint, tipos, build, formatação, Node e compilador                    | Aprovados                                               |
| Base técnica legada e contrato do hub fixado                              | Verificação aprovada, sem mudar instruções legadas      |
| Hub: lint e contract:check                                                | Aprovados; transporte não alterado                      |
| Guards MCP/hub/agente                                                     | Recusa esperada, exit 1 nos três                        |

Os quatro casos novos da cadeia criam personas independentes, suspendem a fonte,
confirmam que outra persona na mesma base continua consultando, recuperam pela
prova real e verificam publicação ainda suspensa. Substituem o vínculo, recusam
recuperação do anterior, treinam/publicam a nova fonte e demonstram que o token
antigo não pode usá-la. Token novo e concessão explícita permitem consultar com
proveniência da substituta. As operações incertas e reinícios dos casos anteriores
continuam aprovados; isso não é homologação de todas as janelas de queda.

As mensagens de publicação dos testes Python pertencem a fixtures/mocks do
procedimento de release. Nenhum instalador, appcast ou release real foi publicado.

A primeira tentativa de integração foi bloqueada pelo sandbox local (`EACCES`);
os testes foram repetidos com acesso autorizado apenas à infraestrutura isolada.
O frontend também precisou de diretório temporário próprio para o cache SSR no
Windows. As rodadas finais acima passaram sem omitir testes obrigatórios.

## Hashes SHA-256

| Arquivo                                                           | SHA-256                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| MCP migrations/persona-v2/0011_source_replacement.sql             | `fff2dcf750729354e2cda4c2d4aab09a84bcbe5653449a2b9266f8ffbdc94966` |
| MCP src/application/persona-v2/maintenance.ts                     | `577db413504bb22ff42af0de6a63f24b987feaf9a655fbccf0b56b490a1e8096` |
| MCP src/application/persona-v2/administration.ts                  | `5c14db341a4491ba268d75c9e5123aa755e1e3a137f447a300a805d0d625f1ba` |
| MCP src/infrastructure/persistence/persona-v2/repository.ts       | `a8229834526e53c6aaa3809bfac7eb5687efa775f3fca16f251166a5cb6974ea` |
| MCP web/src/persona-v2/SourceLifecycle.vue                        | `778a7ae022ebbbba64258b2c7e15ad4699b0414e36e18afaf95336227ffbabbe` |
| MCP web/src/persona-v2/PersonaConsole.vue                         | `38463d461cc2f1bd1a61a9b06a63fd61aceee5a37ce269fb3a2045208e8011b0` |
| MCP tests/homologation/persona-chain.test.ts                      | `5fa423173fda586d393c1e0742496a9bda753b4de6f969f064a3053c59f37944` |
| MCP tests/persona-v2/source-lifecycle-migrations.postgres.test.ts | `a904b35e491a6c46e247e9f5e55bf62b5c070b3bad3d1750bcca23a30fc151b5` |
| MCP tests/persona-v2-browser/persona.spec.ts                      | `2da0c235e8c3a585e49bb300d23c82a091b427ea6b86a17b92a1a9c4c759bf63` |
| Hub scripts/check-persona-release.mjs                             | `dc91a56dc30e71b6bff8e702934f2cdbc4b252afd34dbf76e1be12ee5830b33f` |
| Agente tool/release/check_persona_release.py                      | `d74a8068cebc66afa182817568c7d4c10c3716a4499189a965e437782273403e` |
| Hub/agente contracts/persona-v2-release.json                      | `212dc6bb71232a8bdb8ffe57e5ac78cd21c152b5383ef8689d3c8df55ed0cbcd` |

## Limites e limpeza

Esta rodada não encerra administração por token, conhecimento compartilhado
executável, runners genéricos, privacidade por uso, integrações, worker/anexos,
instalação ChatGPT, imagens candidatas ou avaliação da IA. Não certifica o
bootstrap/instalador desktop, acesso concorrente ao cofre, permissões mínimas
de todos os motores, cópia/restauração SQL Anywhere ou toda revogação em trânsito.
O companion mantém tabela fixa de teste; não é o runner genérico do produto.
Chromium parcial não substitui a matriz completa de acessibilidade, zoom e telas.

O removedor das quatro fixtures verificou caminho, labels, volumes exclusivos,
DSN e processo SQL Anywhere antes de remover os recursos próprios. O cofre de
fixture foi descartado, sem abrir ou migrar cofre operacional. O contêiner
PostgreSQL já existente permaneceu preservado. Não houve DML em fonte cadastrada.
O ambiente externo em homolog-mcp.se7esistemassinop.com.br não foi provisionado.

O PostgreSQL 16 usado pelas suítes de controle/UI também foi removido após
conferência do ID e labels exclusivos. A inspeção final manteve somente o
contêiner PostgreSQL que já existia antes da tarefa.
