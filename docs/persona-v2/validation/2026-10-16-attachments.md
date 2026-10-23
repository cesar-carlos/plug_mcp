# Anexos JSON persona-v2 — 2026-10-16

Evidência parcial de desenvolvimento. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais anteriores
preservadas. [Inventário SHA-256 desta frente](2026-10-16-attachments-files.json)
identifica os arquivos revisados, sem representar um commit ou o candidato
integral dos três projetos. Hub fixado em
`76950497dc386130e13b7d6afc0678e50208e985`; snapshot/contrato upstream não foram
alterados. Não houve commit, push, publicação de imagens ou deploy.

## Entrega

[Contrato](../attachments.md): JSON de consulta publicada executada fresca pelo
port existente do hub/agente, sem cache/singleflight. Contrato `attachments` e
finalidade `exportacao` em todos os campos projetados exigem capability nova
explicitamente concedida. Flags antigas reservadas não ativam exportação.

Handle aleatório de 256 bits, cifrado na memória do processo, com vínculo à
persona/token/versões/concessão, prazo e quotas. HTTP, MCP e resources revalidam
autoridade local/remota, identidade, policy, fonte, publicações, limites e revisão
física. Metadados fixos conferem dependências estruturais compartilhadas; prova
inconclusiva recusa e incompatibilidade comprovada suspende as publicações usadas.
Download não repete SQL de negócio nem renova leitura/prazo. Reinício invalida
handles; ausência não dispara outra consulta. Binários continuam indisponíveis.

Console permite publicar o contrato, escolher finalidades, conceder tokens,
criar e baixar JSON. Página parcial conserva indicação explícita, proveniência
e paginação. Credenciais/handle não entram no URL de navegação ou armazenamento
local. Auditoria 0038 registra somente ID independente e metadados, na transação
de revalidação, sem handle, SQL, parâmetros ou linhas.

Teste adicional encontrou que a finalidade de saída verificava somente o
primeiro ramo de UNION. Corrigida para conferir todos os ramos por posição,
mesmo com aliases diferentes; cobre exportação e usos adicionais dos cruzamentos.

## Ambiente e resultados

- PostgreSQL **17.11**, contêiner exclusivo `se7e_attachment_a6bbaba7a0ec_test`,
  label de proprietário igual ao nome, porta loopback 57308.
- Imagem `postgres:17-alpine`, ID
  `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
- Node **24.21.0**, compilador TypeScript **7.0.2** reais. Bancos aleatórios
  `_test`, schemas e credenciais sintéticos. Nenhuma fonte do usuário utilizada.

| Verificação                                        | Resultado                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Unitários dirigidos de anexos/finalidades/consulta | 57/57 antes do caso adicional de UNION                                                       |
| Regressão geral final                              | 1.460 aprovados, 91 não executados; 160 arquivos aprovados/seis não executados; 69,74 s      |
| PostgreSQL v2 final                                | 268/268, dezessete arquivos, 129,32 s                                                        |
| Frontend                                           | 36/36, treze arquivos; lint/tipos/build aprovados                                            |
| Chromium v2 completo                               | 29/29, 2,3 minutos, sem retries                                                              |
| Gates locais                                       | Node, compilador real, lint, tipos, build, formatação, docs:check e training:check aprovados |

Rodadas sobrepostas não são somadas. A suíte PostgreSQL utiliza autoridade/hub
sintéticos e SQL PostgreSQL real; não executa companions reais do hub/agente.
OAuth usa persistência real e fluxo PKCE/consentimento/token, em HTTP de teste,
sem afirmar TLS público. Testes unitários da guarda não certificam metadados
dos outros motores.

Casos novos comprovam:

- JSON com decimal textual, origem, prazo e headers seguros; HTTP/MCP/resource
  leem sem novo SELECT de negócio.
- Outro token/concessão, cookie administrativo e origem externa recusados;
  token manual não é access OAuth. Revogar uma concessão preserva as demais.
- Concessão sem `attachment-contract` não recebe exportação; aliases, expressões
  e UNION não ocultam finalidade ausente.
- Revogação durante revalidação remota descarta bytes; revisão física alterada
  e journal incerto impedem entrega. O journal sintético fica imutável em fonte
  exclusiva até descarte do banco inteiro, sem apagar tombstone.
- Falha transacional da auditoria não emite handle/evento parcial; quota não
  expulsa handles vivos; cifra corrompida, prazo e encerramento falham fechados.
- Guarda estrutural ignora recurso não utilizado; constraint desconhecida recusa
  sem afirmar drift. Mudança comprovada suspende dependências usadas.
- Chromium móvel 390 px percorre persona/base/treinamento/publicação/token e
  download JSON de 25 linhas entre trinta, com `complete:false`, sem total falso;
  trocar token remove o descritor. Demais jornadas anteriores também passam.

As primeiras rodadas expuseram uma finalidade de filtro ausente na fixture UI,
expectativa de duas linhas onde a fixture possui trinta e seletor de label que
incluía opções. Corrigidos os casos sem reduzir autorização. A asserção da base
comum foi atualizada para a versão nova. Ensaio inicial tentou remover journal
sintético protegido; a proteção recusou. O caso passou a usar outra fonte e a
preservar o registro até o descarte integral da fixture. Falhas anteriores não
foram tratadas como aprovação. O Vitest no sandbox perdeu módulos SSR temporários;
rodadas nativas repetidas mantiveram os mesmos critérios e passaram.

Durante sincronização documental, uma edição PowerShell alterou caracteres em
dois textos. Conteúdo e referências foram recuperados e revisados, sem modificar
snapshots publicados; docs:check, formatação e testes posteriores passaram.

Contêiner e volume anônimo exclusivos removidos após conferir propriedade,
ao encerrar os testes. Recursos compartilhados preservados.

## Limites de aceite

Os 91 casos não executados na configuração geral não certificam ambientes ou
motores obrigatórios. Esta rodada não homologa a cadeia persistente dos três
motores, agente instalado, infraestrutura distribuída, recuperação de anexos,
binários, download público, plugin real ou comportamento da IA consumidora.
HTTPS público e conexão ChatGPT continuam para validação manual, conforme decisão
do usuário. Não houve DML experimental em fontes operacionais.

Evidência parcial para identidade/autorização, treinamento/consulta, PostgreSQL,
OAuth/console e corte. Treze gates continuam sem aceite; `completedGates: []` e
`ready: false` permanecem. [Pendências](../remaining-plan.md) e
[matriz de aceite](../acceptance.md).
