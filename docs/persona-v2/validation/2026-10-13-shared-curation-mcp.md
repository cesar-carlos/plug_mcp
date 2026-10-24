# Curadoria e ferramentas MCP — avanço parcial

Rodada de 2026-10-13, America/Cuiaba. Etapas 3, 4 e 13 do
[plano restante](../remaining-plan.md). Não houve commit, push, publicação de
imagem ou deploy. Os três manifestos conservam `ready: false`, catorze gates
obrigatórios e nenhum concluído.

## Candidato e ambiente

Checkouts com alterações locais preservadas. O [inventário central](2026-10-13-shared-curation-mcp-files.json)
registra hashes dos arquivos do recorte, revisões e versões observadas. Não é
snapshot do checkout inteiro nem um commit upstream.

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `570e797b728eafa1cdc950be5e446ab7dd1c497c` |

Node **24.21.0**, TypeScript **7.0.2** real. Contrato hub **1.12.0**,
hash `45589c3da2f94639c097893abf73e91360f0cbe2a3c48399ee36444be39f1092`;
snapshot `4a46ee3db954130fafa74736824678ed7e66efccf72928def5345d19f7122493`.
Nenhum contrato, migration ou código de produto do hub/agente mudou nesta rodada.

Fixture dedicada `se7e_persona_061ea52668e0_test`: controle MCP em PostgreSQL,
hub PostgreSQL/Prisma separado, autenticação/ClientAgentAccess reais de fixture,
processos independentes, agente companion com configuração Drift, cofre DPAPI e
journals duráveis. SQL passou por MCP → REST hub → Socket.IO agente → ODBC.
Strings observadas: PostgreSQL `17.0.11`, SQL Server `16.00.4236`, SQL Anywhere
`16.00.0000`, Firebird `06.03.1812 WI-V Firebird 5.0`. Cinco binários de drivers
foram conferidos por hash; versões no inventário.

As suítes PostgreSQL/Chromium criam bancos próprios na fixture. Sua autoridade e
inspeção são **sintéticas**, próprias para verificar aplicação/isolamento; não
substituem a cadeia persistente real dos quatro motores executada separadamente.
Nenhuma fonte cadastrada pelo usuário foi usada em testes ou escrita experimental.

## Entrega e verificações

- Migration aditiva 0016: payload/proveniência imutáveis, vínculos compostos,
  decisão terminal e prévias exatas. Migrations anteriores não foram alteradas.
- Propostas tipadas de tabela/campos, relacionamento, exemplo SQL ou regra,
  sem captura automática. Curador autenticado revisa hash/diff/prazo/CAS e
  incorpora somente ao rascunho. Publicações, skills e tokens não são atualizados.
- MCP lê padrões/perfis pelo recorte da skill concedida. Propostas exigem
  `treinar`, consentimento/delegação e papel vigente no catálogo. Histórico próprio
  do token não abre acesso à fila inteira. Publicar catálogo continua no console.
- Exemplos explícitos privados/compartilhados começam candidatos, recebem
  validação SQL sem execução e exigem revisão editorial antes de publicar.
  Modelo/parâmetros e publicações anteriores são preservados.
- Console apresenta propostas, proveniência, comparação traduzida, justificativa,
  confirmação e estados. Edição é protegida; respostas antigas não trocam o contexto.

Regressões executadas: domínio v2 e verificadores de contrato/release/documentação,
PostgreSQL v2, console completo Chromium, frontend, lint, TypeScript 7, builds,
Node/compilador, contrato fixado e documentação. A cadeia persistente passou
**30/30**, sem skips, incluindo consulta/escrita/recuperação existentes e novas
leituras `listar_padroes`/`obter_padrao` nas quatro fontes, com negação após suspensão.
Console completo **20/20**; frontend **31/31**. Após traduzir o diff, a jornada
afetada foi repetida e passou em 360/390/768/1280 pixels, com capturas sintéticas
de 360/1280 inspecionadas. Isso não certifica leitor de tela nem zoom real de 200%.

Persistência cobre autoria/catálogos/cursores isolados, papéis, consentimento OAuth,
delegação revogada, fonte/skill não concedida, FK contra outra persona, payload e
decisão imutáveis, expiração, mudança de revisão/papel, suspensão da base e corrida
de incorporação. Auditoria não contém SQL, payload nem justificativa editorial.
Contagens de rodadas distintas não são somadas como cobertura integral.

| Rodada                                                             | Resultado                     |
| ------------------------------------------------------------------ | ----------------------------- |
| Domínio v2 e verificadores de plugin/contrato/release/documentação | 329/329, 31 arquivos          |
| Persistência PostgreSQL v2 final                                   | 161/161, dez arquivos         |
| Console Chromium completo                                          | 20/20                         |
| Após tradução do diff e capturas nas quatro larguras               | Jornada afetada repetida, 1/1 |
| Frontend                                                           | 31/31, lint, tipos e build    |
| Cadeia persistente dos quatro motores                              | 30/30, sem skips              |

## Falhas tratadas e limites

Novos testes ajustados ao comportamento real da sessão temporária, seleção
acessível e CSRF vigente. A tentativa inicial do verificador de symlinks encontrou
limitação Windows; repetida com permissão adequada, passou sem relaxar validação.
Vitest no sandbox exigiu TEMP/TMP privados da fixture; a rodada válida preservou
todos os casos. Dois testes existentes receberam somente formatação pontual para
passar o verificador de estilo; nenhuma lógica foi alterada por isso.

Permanecem propostas de particularidades físicas, feedback, revisão temporal,
templates/datasets, grafo/busca ampliados, runners genéricos, adoção DML e matriz
adversarial integral. Enforcement SQL Anywhere continua desconhecido; constraints
não comprovadas não habilitam dependências. Console oferece envio estruturado de
regra/exemplo e revisão dos quatro tipos; envio de tabela/relacionamento usa o
contrato MCP tipado ou edição direta do padrão existente.

Não foram homologados nesta rodada: desktop instalado, TLS/proxy público, cliente
ChatGPT privado, avaliação da IA consumidora, integrações, workers/Redis/cache,
anexos, retenção e corte. A prova da cadeia não certifica esses gates.

## Limpeza e liberação

Fixtures e processos de teste são descartados pelo manifesto explícito, com
verificação de ownership de containers, volumes, DSN e SQL Anywhere. Recursos
operacionais do usuário não integram o escopo de limpeza.

Os gates [compartilhado](../acceptance.md#shared-knowledge-and-compatibility),
treinamento, OAuth/console, quatro motores e corte continuam pendentes de aceite
integral. A entrada v2 permanece de desenvolvimento e o deploy bloqueado.
