# Console de inspeção e perfis físicos — avanço parcial

Rodada de 2026-10-13, America/Cuiaba. Etapas 4 e 13 do
[plano restante](../remaining-plan.md). Persona-v2 permanece de desenvolvimento;
nenhum gate foi encerrado e não houve commit, push, publicação ou deploy.

## Candidato e ambiente

Checkouts com alterações locais preservadas. O [inventário de 99 arquivos centrais](2026-10-13-console-physical-knowledge-files.json)
registra SHA-256, revisões e versões observadas. Identifica o recorte validado,
sem representar um commit upstream ou o checkout completo.

| Projeto | HEAD de referência                         |
| ------- | ------------------------------------------ |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` |
| Hub     | `0d2c6b488438a77be71b39e514cd06ab11fbb95e` |
| Agente  | `570e797b728eafa1cdc950be5e446ab7dd1c497c` |

Node **24.21.0**, TypeScript **7.0.2** real. Contrato hub aditivo **1.12.0**,
hash `45589c3da2f94639c097893abf73e91360f0cbe2a3c48399ee36444be39f1092`;
snapshot `4a46ee3db954130fafa74736824678ed7e66efccf72928def5345d19f7122493`.
Nenhuma migration ou contrato do hub/agente foi alterado nesta rodada.

A fixture final da cadeia foi `se7e_persona_fb05cfde744b_test`: PostgreSQL
de controle MCP e PostgreSQL/Prisma do hub separados, autenticação e aprovação
reais de ClientAgentAccess, processos independentes, Drift/DPAPI e journals
duráveis dedicados. Todo SQL de negócio dessa rodada passou por MCP → REST hub
→ Socket.IO agente → ODBC. PostgreSQL `17.0.11`, SQL Server `16.00.4236`,
SQL Anywhere `16.00.0000` e Firebird `06.03.1812 WI-V Firebird 5.0`, conforme
strings observadas. Cinco drivers têm versões e hashes no inventário.

Chromium e persistência MCP usaram bancos próprios no PostgreSQL da fixture
`se7e_persona_cf1e2ec94bcd_test`. A autoridade do navegador é **sintética**;
o helper de inspeção usa SQL fixo de metadados somente em seus bancos de teste.
Isso não substitui o transporte real verificado separadamente na cadeia.

## Entrega e verificações

| Verificação                                                  | Resultado                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Cadeia persistente dos quatro motores                        | **30/30**, nenhum caso excluído na rodada final                                  |
| Domínio v2, contrato fixado, adapter REST e guard de release | **302/302**, 29 arquivos                                                         |
| Persistência PostgreSQL v2                                   | **155/155**, dez arquivos                                                        |
| Console completo no Chromium                                 | **19/19**                                                                        |
| Após ajuste visual final de CSS                              | Jornada de inspeção/perfil/adoção repetida: **1/1**                              |
| Frontend                                                     | Lint, tipos, **31/31** testes e build                                            |
| MCP                                                          | Lint completo, TypeScript 7, build, Node/compilador, training:check e docs:check |

Contagens pertencem a execuções distintas e não são somadas como prova de
cobertura integral. A rodada completa do Chromium precedeu somente o ajuste
final de espaçamento/rolagem da tabela; a jornada afetada foi repetida nas quatro
larguras, com revisão visual das capturas sintéticas de 360 e 1280 pixels.

O console permite selecionar base, catálogo e snapshots publicados; inspecionar
schemas/tabelas/views exatos; ler colunas, chaves, cobertura e validade; comparar
padrão/perfil no servidor; criar, editar por CAS, revisar, publicar e suspender
perfis. A publicação não seleciona a versão automaticamente. Um perfil da base A
não aparece na base B. Listagens usam cursores independentes e recusam cursores
de outra identidade ou publicação suspensa fora da visibilidade do leitor.

O treinamento seleciona tabelas e campos, confere a evidência e aplica a versão
somente ao rascunho. SQL, parâmetros e exemplos são preservados; a publicação
anterior permanece intacta até republicação explícita. Campos sem classificação
livre ou sem grão e pares necessários são recusados. Chaves de campos não usados
não ampliam nem bloqueiam a expectativa dessa consulta.

Foram verificados: navegação com escopo pendente e continuação de edição,
confirmação de publicação, atualização das listas sem perda do editor, prova
inconclusiva para recurso não observado, invalidação da comparação após mudança
de escopo, preservação do snapshot ativo, isolamento físico e larguras de
360/390/768/1280 pixels. Nomes físicos longos quebram linha; a rolagem horizontal
fica na tabela, mantendo as colunas legíveis. As regressões existentes cobrem
tokens, troca de contexto, edição concorrente, consultas e cruzamentos.

## Falhas tratadas e limites

Corrigidos na rodada: integração das guardas de edição, atualização de perfis
sem desmontar o formulário salvo, descarte da seleção sem perder treinamento
privado, papéis acessíveis do diagnóstico, nomes físicos longos e tabela estreita
no celular. Dois seletores/asserções novos da suíte foram ajustados ao contrato
real. O teste de conflito precisava de Content-Type JSON explícito na resposta
simulada; isso preserva sua verificação de CAS e edição local, sem relaxar o produto.

Uma tentativa de reutilizar a primeira fixture falhou durante a preparação ODBC
do agente; seus 30 casos não executados **não contam como aprovação**. A rodada
final em fixture nova executou todos os 30. Restrições do sandbox a TEMP/conexões
locais e leitura do hub foram resolvidas com TEMP explícito e execução autorizada,
sem alterar gates. Avisos de comentários PURE da dependência Zod e notificações
MCP em modo JSON não foram tratados como evidência de falha funcional ou aceite.

Continuam pendentes enforcement SQL Anywhere, adoção em DML, relações físicas
reversas/N:N, composição de evidências de várias páginas, curadoria/tools/runners
ampliados e a matriz adversarial completa. Esta rodada não certifica leitor de
tela, zoom real de 200%, avaliação da IA consumidora, instalação privada ChatGPT,
desktop instalado do agente, TLS/Redis distribuídos ou imagens/corte de produção.
As limitações dos demais gates permanecem no [plano](../remaining-plan.md).

## Limpeza e liberação

As duas fixtures desta rodada são removidas pelo script que verifica manifesto,
paths, labels, processos e volumes próprios. Bancos, credenciais e dados
sintéticos não são incorporados à evidência. Assets e capturas não contêm
credenciais. Banco operacional existente, cofres operacionais e fontes do usuário
permanecem preservados.

A limpeza da primeira fixture recusou corretamente um PID reutilizado por outro
aplicativo. Foi comprovada a ausência de qualquer servidor SQL Anywhere ligado
ao path/run da fixture antes de remover somente o registro obsoleto de PID e
reexecutar a limpeza protegida. O processo reutilizado não foi encerrado.

Os três manifests de liberação permanecem `ready: false`, com 14 gates exigidos
e nenhum concluído. Esta evidência documenta avanço de desenvolvimento, não aceite.
