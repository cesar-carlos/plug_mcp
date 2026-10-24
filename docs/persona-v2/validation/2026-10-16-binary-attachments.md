# Anexos binários persona-v2 — 2026-10-16

Evidência parcial de desenvolvimento. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais anteriores
preservadas. O [inventário SHA-256](2026-10-16-binary-attachments-files.json)
identifica arquivos e dependências revisados, sem representar commit ou candidato
integral dos três projetos. Hub fixado em
`76950497dc386130e13b7d6afc0678e50208e985`; contrato e snapshot upstream
preservados. Não houve branch, commit, push, publicação de imagens ou deploy.

## Entrega

[Contrato](../attachments.md): bytes originais de uma coluna física de consulta
publicada, usando exclusivamente o port do hub/agente. `binaryAttachments` fixa
tabela/coluna, MIME, bytes e prazo; `binary-attachment-contract:<hash>` exige
concessão nova no token/consentimento. Projeção e exportação são explícitas;
pessoal/sensível conserva justificativa. Contrato JSON antigo não autoriza binários.

Preservado `odbc_type` inteiro do wire como `odbcType`. Célula exige metadado
binário positivo, alias exato e base64 canônico limitado antes/depois de decodificar.
Texto comum nunca é inferido como arquivo. PDF/PNG/JPEG/WebP dependem de assinatura
e MIME publicados; octet-stream explícito permite `.bin`. Assinatura não certifica
segurança ou integridade; não renderizar, converter, extrair ou executar conteúdo.

Uma skill, coluna direta e registro completo, com ORDER BY. Paginação do consumidor,
JOIN, UNION, subconsulta, expressão, agrupamento, DISTINCT e limite SQL são recusados.
O servidor controla a primeira página de duas linhas, exige uma linha e metadados
sem próxima/página anterior. O wire real omite `truncated` quando falso; ausência
não é prova de completude. Orçamento menor que duas linhas bloqueia antes do hub.
Consulta comum/JSON não projeta a coluna declarada binária, mesmo sem metadados.

Handle opaco, cifras, quotas e prazos reutilizam o armazenamento isolado da entrega
JSON. HTTP/MCP/resource revalidam persona, token/concessão, publicação, fonte,
credencial, identidade, policy, revisão física e estrutura. Download não repete
SELECT de negócio. Descritor binário conserva proveniência; HTTP envia disposition
attachment, no-store, nosniff e CSP sandbox. Auditoria registra somente metadados.
Sem nova migration: contrato opcional usa treinamento/snapshots existentes e a
auditoria 0038 existente; nenhuma migration aplicada foi modificada.

Console permite selecionar coluna, MIME, bytes e prazo, publicar, conceder token,
criar e baixar binário. Seleções começam vazias; nada concede acesso automaticamente.
Segredos e handles permanecem em memória. O pacote privado v2 teve somente a skill
e o catálogo local sincronizados com tools entregues; identidade, versão e IDs
reais das conexões preservados. Nenhuma instalação/conexão foi alterada.

## Ambiente e verificações

- Node **24.21.0**, TypeScript **7.0.2** reais.
- PostgreSQL **17.11**, imagem postgres:17-alpine, ID
  `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
- Contêiner exclusivo `se7e_binary_8d8b3a20da24_test`, label de proprietário
  igual ao nome, porta loopback **62357**, bancos aleatórios de fixture.
- Hub/autoridade sintéticos; SQL PostgreSQL real. Nenhuma fonte, credencial
  operacional ou base de negócio do usuário foi utilizada.

Comandos executados com `scripts/with-project-node.ps1`; URL de PostgreSQL
selecionada explicitamente por `PERSONA_V2_TEST_DATABASE_URL`, sem arquivo de
ambiente operacional. Rodadas sobrepostas não são somadas.

| Verificação                | Resultado e alcance                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` final           | **1.466 aprovados, 91 não executados**, 160 arquivos aprovados/seis não executados; **70,49 s**, após correção do parser              |
| PostgreSQL v2 completo     | **272/272**, dezessete arquivos, **153,41 s**, antes da recusa adicional de DISTINCT/agrupamento e ajuste final do catálogo do plugin |
| PostgreSQL dirigido final  | **66/66**, consulta/anexos e baseline/catálogo, **19,96 s**, após esses ajustes                                                       |
| Unitários dirigidos finais | **93/93**, anexos, adapter, consultas e pacote/validador, **5,13 s**                                                                  |
| Frontend                   | **36/36**, treze arquivos; lint/tipos/build aprovados                                                                                 |
| Chromium completo          | **30/30**, **2,3 min**, sem retries; antes da recusa adicional de DISTINCT/agrupamento                                                |
| Chromium binário final     | **1/1**, **6,5 s**, após a correção, móvel 390 px                                                                                     |
| Gates estáticos            | Node/compilador real, lint, tipos, build, formatação, docs:check e training:check aprovados                                           |
| Release guard              | Recusa com exit 1 esperado; `ready:false`, treze gates exigidos e `completedGates:[]`                                                 |

Casos novos verificam bytes bytea idênticos na entrega HTTP/MCP/resource, MIME
efetivo, proveniência, novo contrato concedido, isolamento entre tokens/OAuth,
revogação, policy e revisão física, sem nova consulta de negócio no download.
Metadado ausente/textual/conflitante, valor nulo/vazio/objeto/array, base64 inválido,
duplicata, corte, paginação incompleta, orçamento inferior a duas linhas, outra coluna e construções não permitidas
recusam arquivo. Assinaturas PNG/JPEG/WebP e MIME divergente também foram conferidos. Quotas/cifra/prazos e guardas estruturais anteriores permanecem.
Payloads PDF são fixtures de assinatura, sem afirmar validade de documento renderizado.

No ensaio final de ocultação de duplicatas, o teste falhou porque o parser T-SQL
representa DISTINCT como string e o PostgreSQL como objeto. Corrigida a leitura
comum da AST para preservar usos de agrupamento; teste direto dos três dialetos
e regressões finais passaram. O ajuste não transfere contratos/dados entre runtimes.
Uma tentativa de filtro Chromium sem título correspondente não encontrou testes;
o filtro correto executou o cenário final. Rodadas reprovadas não contam como aprovação.

O contêiner e seu volume anônimo exclusivos foram removidos após conferir nome,
ID e label de propriedade; ausência foi verificada. Recursos compartilhados
preservados. Logs locais ignorados não integram o artefato nem a evidência de produção.

## Limites e pendências

Esta rodada não certifica transporte binário ODBC pela cadeia persistente completa
dos três motores. Ler o código real de normalização/metadados do agente orientou
o contrato, mas não substitui a homologação executável. Os 91 casos não executados
da configuração geral não certificam ambientes obrigatórios.

Continuam pendentes homologação binária PostgreSQL/SQL Server/SQL Anywhere pela
cadeia real, armazenamento entre processos, recuperação de anexos, infraestrutura
distribuída e avaliação separada da IA. HTTPS público e instalação/conversa ChatGPT
permanecem para validação manual. Atualização local de uma skill não comprova
instalação no cliente. [Plano restante](../remaining-plan.md) e
[matriz de aceite](../acceptance.md) conservam todos os gates pendentes.
Produção e publicação de imagens permanecem bloqueadas.
