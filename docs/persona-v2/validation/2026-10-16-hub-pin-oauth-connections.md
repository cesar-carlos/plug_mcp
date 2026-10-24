# Pin revisado do hub e conexões OAuth — 2026-10-16

Evidência parcial de desenvolvimento. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais preservadas.
[Inventário parcial SHA-256](2026-10-16-hub-pin-oauth-connections-files.json)
identifica esta frente; não representa commit, release ou candidato integral.
Treze gates continuam pendentes; `ready: false` e `completedGates: []` preservados.

## Referência revisada

Hub limpo em `76950497dc386130e13b7d6afc0678e50208e985`, sucessor do pin
`e8f56db8e0205b94b99b5ac7dabd41655f4fd2c0`. Revisão local dos dezessete arquivos
alterados: atualização de bcrypt/nodemailer/Zod, compatibilidade de validação
de arrays, testes de senha/e-mail e medição de ETag. O helper Zod conserva os
limites e a precedência do erro dos elementos; não introduz campos, permissões
ou capabilities de SQL. O MCP e o workflow CI fixam o novo SHA exato.

Verificação autenticada, somente leitura, das execuções upstream para esse SHA:
[CI 38910312191](https://github.com/cesar-carlos/plug_server/actions/runs/38910312191)
aprovado em nove jobs, incluindo Static/contrato e Dart;
[CodeQL 38910311857](https://github.com/cesar-carlos/plug_server/actions/runs/38910311857)
aprovado. CI upstream não substitui a homologação integrada do novo candidato.

- Contrato 1.15.0 preservado, SHA-256
  `a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60`.
- Snapshot histórico preservado, SHA-256
  `7f1b746a782b5023aed562cb40edbf72dbe39a15498fcba2e36a949604aa1948`.
- Base histórica: `bfb40becd42c5452b19b0df13698d212a0238ddc`.
- Ancestral de incorporação revisado:
  `e8f56db8e0205b94b99b5ac7dabd41655f4fd2c0`.
- Hash derivado da base técnica 1.1.0 após o pin:
  `59b5063f4dd8d9a76688a663b9f745ab534a0f1f6515937751c928329e87d453`.

O reverse-check textual diretamente no novo HEAD falhou nos contextos alterados
dos validadores. Não se alterou o patch para contornar isso. O novo verificador
exige base → ancestral incorporado → candidato e comprova o patch no ancestral
fixado, por `read-tree` e `apply --reverse --check --cached` em índice temporário
próprio. Exige ainda HEAD exato, hash do contrato no checkout e no commit, e
hash do snapshot. Checkout ausente falha; mesmo contrato em outro HEAD não basta.
O índice real e o status do hub foram conferidos antes/depois, sem alteração.
Hash do índice real antes/depois:
`70d55eaa88d23cbd3dbb21196bbffc373b12e6441e53865bd3af361a09ea5ba5`;
checkout limpo nas duas verificações.
Testes usam repositórios Git descartáveis, nunca commits nos projetos.

## Entrega do console

[Contrato OAuth](../oauth.md#gestão-administrativa-das-conexões): responsável
Client lista consentimentos da própria persona em páginas de vinte, com estado
local, consumidor, token originador, prazo e consentimento. Não recupera segredos
nem certifica autoridade remota ou conexão real do ChatGPT.

Revogação exige sessão revalidada, Host/Origin, CSRF, confirmação e fingerprint
do vínculo exato. Locks persona/token/concessão e auditoria na mesma transação;
repetição concorrente entrega comprovante terminal sem duplicar evento.
Access/refresh dessa concessão deixam de funcionar; token originador e segunda
conexão continuam válidos. Aprovação de operações e efeitos anteriores não mudam.
UI protege a revisão ao navegar, descarta respostas antigas e impede duplo envio.

Migration aditiva 0036: data de criação imutável só para novos consentimentos,
índice de paginação e vínculo de auditoria por persona/concessão. Datas antigas
continuam NULL, sem backfill inventado. Identidade revogada não é apagada.
Nenhuma migration anterior foi modificada nesta frente.

Regressão também detectou que conflito de edição de fonte aguardava um refresh
automático e podia apresentar outro erro. O console agora mostra a recusa sem
esse refresh e preserva os campos até recarregamento explícito. O caso Chromium
recusa requisições de refresh durante o conflito para comprovar esse contrato.

## Ambiente e verificações

Fixture própria `se7e_oauth_admin_6a19cd835f21_test`, label de propriedade igual
ao nome, PostgreSQL 17.11 / `postgres:17-alpine`, porta 64536 somente loopback.
Imagem `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
Bancos aleatórios `_test` de controle e navegador; nenhuma fonte do usuário,
arquivo operacional ou credencial real foi usado. Node 24.21.0 e TypeScript 7.0.2
reais pelo wrapper do projeto.

| Rodada                                      | Resultado                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `training:check`                            | Aprovado no checkout exato revisado                                                     |
| Pin e prova histórica                       | 9/9; índice/arquivo/status da fixture preservados                                       |
| Pin, prova e leitura pública da base        | 10 aprovados, quinze não selecionados; 25 casos no conjunto                             |
| OAuth e baseline PostgreSQL                 | 50/50, 10,69 s                                                                          |
| Integração v2 completa PostgreSQL           | 258/258, dezessete arquivos, 107,94 s                                                   |
| Unitários v2                                | 512/512, 21,92 s                                                                        |
| Regressão geral final                       | 1.438 aprovados, 91 não executados, 158 arquivos aprovados/seis não executados, 79,98 s |
| Frontend final                              | 36/36, treze arquivos, 682 ms                                                           |
| Chromium dirigido de conexões               | 1/1, 4,9 s, 390px                                                                       |
| Chromium completo após correção de conflito | 28/28, 2,4 min                                                                          |

Rodadas sobrepostas não são somadas. Testes nativos exercitam core OAuth real,
replay após revogação, outra persona, autoridade indisponível, CAS/CSRF, dupla
revogação, rollback de auditoria, paginação e registros históricos sem data.
O navegador usa autoridade sintética e consentimentos de fixture; não comprova
instalação do plugin. Falha inicial nativa era URL de histórico incorreta no
teste, corrigida para `/historico`. Regressão Chromium inicial teve 27 aprovados
e um conflito de fonte falho; repetição isolada confirmou intermitência antes
do ajuste. Rodada frontend no sandbox perdeu temporários SSR; repetição com
temporários Windows nativos aprovou, sem reduzir critérios ou remover casos.
Os 91 casos não executados na configuração geral permanecem sem evidência desta
rodada; não foram convertidos em aceite de infraestrutura ou gates obrigatórios.

Tipos, lint e builds servidor/frontend aprovados. Verificações próprias de
scripts, Node/compilador, documentação, formatação e guard de release também
registradas na rodada final; o guard continua recusando publicação.

Processos e bancos de navegador foram encerrados. Container/volume anônimo
próprios removidos após conferir a etiqueta e a ausência posterior; nenhum
recurso operacional ou compartilhado foi removido.

## Limites

Não reexecutou a cadeia de negócio dos três motores, agente instalado, Redis
distribuído, imagens candidatas, receptor público ou avaliação da IA.
HTTPS público e conexão ChatGPT permanecem para validação manual, conforme
decisão do operador. Nenhum gate encerrado, branch/commit/push de projeto,
publicação de imagem ou deploy. Pendências centrais permanecem no
[plano restante](../remaining-plan.md).
