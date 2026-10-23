# Pacote privado e ciclo de vida — 2026-10-12

Evidência parcial de desenvolvimento. Não encerra `oauth-and-console`,
`identity-and-authorization` ou `coordinated-cutover`. O manifesto continua
`ready: false`, `completedGates: []`; deploy e publicação de imagens bloqueados.

## Revisão e ambiente

HEAD MCP: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com mudanças locais
preexistentes e desta rodada ainda sem commit. HEAD sozinho não identifica o
candidato: hashes abaixo registram os arquivos efetivamente validados. Hub e
agente não foram modificados nem homologados novamente nesta rodada.

Windows/PowerShell; Node **24.21.0**, TypeScript real **7.0.2**, Vitest **5.0.3**,
Chromium **153.0.8010.12**, PostgreSQL **17.11** em container exclusivo da rodada,
porta loopback aleatória, credencial aleatória e rótulo de propriedade.
Suítes criam bancos próprios com sufixo `_test`; nenhuma fonte cadastrada foi usada.
Autoridade Client/hub e políticas de fonte são sintéticas nessas suítes.

## Entregas verificadas

- Perfil local de pacote `se7e-package-v1`, schemas fixados, frontmatter,
  nomes/pastas, limites, referências, ausência de registros duplicados,
  geração/variante/ambiente e inventário SHA-256. Assets normais oficiais viajam
  dentro do pacote. Arquivos inesperados, possíveis segredos e links simbólicos
  são recusados. Montagem concorrente não sobrescreve artefatos existentes.
- Catálogo mínimo citado pelas skills conferido com `tools/list` legado e v2;
  fontes do pacote separadas. Candidato v2 portátil usa `/mcp`; ChatGPT v2
  explicitamente recusado enquanto OAuth v2 estiver pendente.
- Suspensão/recuperação administrativa da persona por CAS, isolamento de
  responsável, Host/Origin/CSRF, sessão vigente e auditoria transacional.
  Suspensão bloqueia consumidores, suspende publicações e revoga derivados;
  recuperação preserva snapshots e não ressuscita revogações. Contextos/previews
  antigos são recusados. Falha de auditoria desfaz todas as mudanças locais.
- Console apresenta revisão dos efeitos, confirmação, foco e estado, protege
  edição e limpa contexto. Persona suspensa conserva leitura de histórico e
  recuperação, com bloqueio das demais jornadas da persona.

## Resultados

| Verificação                                                 | Resultado final                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Pacote/prontidão/OAuth legado/guard/domínio v2, 27 arquivos | 300 testes aprovados                                                                                                      |
| `test:persona-v2:postgres`, 7 arquivos                      | 97 testes aprovados                                                                                                       |
| `web:check`                                                 | Lint, tipos, 28 testes e build aprovados                                                                                  |
| Chromium persona-v2                                         | 13 jornadas aprovadas na execução completa; jornada de ciclo de vida aprovada na repetição após corrigir seletor do teste |
| CLI real de montagem e `plugin:check`                       | Portátil v2 de fixture aprovado; ambiente divergente recusado                                                             |
| Lint servidor/testes, typecheck e build servidor            | Aprovados                                                                                                                 |
| Formatação dos arquivos afetados com parser aplicável       | Aprovada                                                                                                                  |
| `docs:check` antes deste relatório                          | 73 arquivos, 421 links, 19 rules, 17 exemplos JSON, 19 exemplos de schema, 14 gates; zero problemas                       |
| Node/compilador                                             | 24.21.0 / 7.0.2 aprovados                                                                                                 |
| `persona:release-check`                                     | Saída 1 esperada: publicação bloqueada                                                                                    |

Falhas encontradas e resolvidas na rodada: criação de junction negada pelo
sandbox foi revalidada com fixture local autorizada; cache temporário do frontend
foi direcionado ao workspace. Teste do histórico tinha seletor ambíguo com a opção
do filtro; foi delimitado ao evento registrado. Teste de rollback passou a esperar
503, conforme mapeamento seguro existente, sem alterar o servidor para expor erro.
No smoke CLI, o separador `--` foi perdido pelo invólucro PowerShell; passar
argumentos como array preservou o separador e confirmou montagem/verificação.
O pacote de smoke foi removido, sem distribuição de domínio/ID sintético.

## Hashes efetivos SHA-256

| Arquivo                                                   | SHA-256                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/infrastructure/plugins/package-plugin.ts`            | `29d2d45e8f8d023e2f5cbb6867b19dcbbff1705f7173a51bd49b8017abc8405e` |
| `src/infrastructure/plugins/package-validation.ts`        | `ecb17ce6cbaa6f2f82ff831749c9dc3ce8623336d7913e5f9d6ec17cd1473bac` |
| `src/infrastructure/plugins/package-files.ts`             | `8dd5218dc84cb169475c1203547ffe8a08f0cd350a26c2f0604286bdbe875049` |
| `src/infrastructure/plugins/package-schemas.ts`           | `c4b974b98484296cc950ef959623f3bbc2ea0911c97d7306085a7f8d297e04fa` |
| `src/infrastructure/plugins/tool-catalog.ts`              | `5432e68d17897ffecf6ded68c401c9241de099d064cc2101558668105bcdf814` |
| `src/application/persona-v2/maintenance.ts`               | `92001461d35c918c408d0a05ea2e042369d97b3002c6bc23ff558400d636fb3c` |
| `src/infrastructure/persistence/persona-v2/repository.ts` | `197e108ab65bb1b16351fd0c87326cc5cf8aae05c57561b0f5f0deb9c2239726` |
| `src/infrastructure/http/persona-v2-admin.ts`             | `c103d7e29c7dd49ca29cfceb2abcbe26f5589d7ffcfa3e90b1b11b6af30b1e6a` |
| `web/src/persona-v2/PersonaState.vue`                     | `c6c436da869628bf47a81e8e647b21448b44637557a3eee5c63b88b5fb09cb35` |
| `web/src/persona-v2/PersonaConsole.vue`                   | `4bc78f601883b3856371511d0d1827c16deab33fa0a3722e9556175d6546cdc7` |
| `src/application/persona-v2/runtime-instructions.ts`      | `41037a6bed19d378cc44f48a0bab145c8eea2cacd04d201e1c0441b96112e38f` |
| `package-lock.json`                                       | `0d02d026421bb15fca54abff0bbde7ba6ad659ead437dc9f6c48b14f9c862547` |
| `contracts/persona-v2-release.json`                       | `212dc6bb71232a8bdb8ffe57e5ac78cd21c152b5383ef8689d3c8df55ed0cbcd` |

## Limites e limpeza

Não executados: instalação/conversa real no ChatGPT, OAuth v2, inspeção
`sourceSchema`, delegação MCP/hub, autoridade Prisma persistente, cofre real do
agente, TLS/proxy/Redis dedicados, quatro motores nesta rodada, IA consumidora,
leitor de tela e zoom real, imagens candidatas e corte. Validação de hashes não
é assinatura de autoria nem prova da configuração interna da conexão remota.
Não houve deploy, publicação, instalação ou alteração de conexão existente.

Não foi necessária migration: estado da persona, suspensões, concessões e auditoria
já têm persistência v2. Migrations aplicadas e entrada legada permaneceram intactas.
O container/volume anônimo próprios foram removidos após conferir nome/rótulo;
configuração temporária de credenciais e pacotes de smoke foram descartados.

Pendências preservadas no [plano restante](../remaining-plan.md), com distinção
entre implementação, homologação e dependência externa.
