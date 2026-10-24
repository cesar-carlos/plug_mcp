# Console Se7e e cruzamentos publicados — 2026-10-12

Rodada da entrada de desenvolvimento `main-persona-v2.ts`. Base Git:
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais e arquivos novos.
O HEAD sozinho não reproduz o candidato. Não houve commit, push, publicação de
imagem ou deploy. [Contrato do console](../console.md),
[trabalho restante](../remaining-plan.md) e [matriz de aceite](../acceptance.md).

## Implementação e alcance exercitado

- Navegação Vue Router por fragmento, catálogo global, criação de persona vazia
  e roteiro de fontes, treinamento, permissões e consulta.
- Logos oficiais locais, favicon/Apple Touch Icon e manifesto v2 separado;
  allowlist estática, sem dependência da pasta externa, service worker ou cache offline.
- Proteção de edição por diálogo acessível, descarte de credenciais após tentativa,
  separação de requisições por contexto e limpeza na expiração/revogação administrativa.
- Nomes/revisões de snapshots publicados, parâmetros valor/vazio/nulo/omissão,
  preservação textual de decimais e paginação de consultas com `page`/`pageSize`.
- Editor estrutural do catálogo: tabelas, campos, chaves, cardinalidades, pares
  compostos, caminhos N:N e exemplos/variantes, preservando JSON avançado.
  Isso não implementa inspeção, perfil físico nem adoção executável do padrão.
- Tokens: listagem sem hash/Bearer, edição CAS, rotação sem sobreposição,
  revogação e invalidação conservadora dos derivados. Novas concessões explícitas.
- Operações: listagem administrativa paginada, revisão do conteúdo exato e
  aprovação pelo responsável, sem execução pela aprovação nem reenvio incerto.
  O cenário de interface usa respostas sintéticas de operações; não realiza DML.
- Fontes: revisão de impacto direto/transitivo, com nomes do snapshot e versões
  anteriores, confirmação explícita antes de salvar/rotacionar e CAS no servidor.
  Até 200 metadados e total exato; a interface identifica listagem parcial.
- Validação: referências somente a campos públicos de primeiro nível, sem valores
  ou mensagens Zod; indicação acessível e foco após liberar o bloqueio de submissão.
- Cruzamentos: descoberta pelo Bearer, dependências exatas, combinação imutável,
  SQL local adaptável, validação separada da execução, paginação final,
  proveniência e recusa após revogação. Emissão exige seleção explícita das consultas
  dependentes. Navegação preserva edição; alteração limpa resultados.

Nenhuma migration aplicada foi modificada. As capacidades usam colunas/tabelas
v2 existentes. A extração do schema estrutural para o domínio preserva sua forma;
não promove conteúdo privado ou concede autoridade.

## Ambiente e isolamento

Windows/PowerShell; Node **24.21.0**, TypeScript real **7.0.2**,
PostgreSQL **17.11** (`postgres:17-alpine`), Chromium **153.0.8010.12**.
Contêiner exclusivo da tarefa, porta loopback dedicada e bancos aleatórios `_test`.
As bases de controle e das duas fontes do navegador são reais e descartáveis.
Após as verificações, o contêiner exclusivo e o descritor temporário da fixture
foram removidos. Nenhum banco externo foi alterado.
O hub/autenticação são sintéticos: não há transporte real plug_server/plug_agente
nesta rodada. A composição de produto continua usando exclusivamente esses serviços
para SQL de negócio; a conexão PostgreSQL direta existe somente nos helpers de teste.

O novo teste de cruzamento cria persona/fontes/consultas, cadastra skill e caso
obrigatório e comprova que preview falha antes do relatório. O processo de teste
separado executa o runner real na fixture e então publica pela API. Não há endpoint
HTTP para aprovar relatórios. Depois emite token pelo console, valida/executa,
confere valores distintos das fontes, pagina após combinar e revoga o token.
O runner de combinação usa casos sintéticos e não certifica semântica de negócio
ou desempenho da IA consumidora.

A suíte mantém o limite de dez logins por minuto. Quando recebe HTTP 429, o helper
aguarda o `Retry-After` informado e repete somente o login sintético; não desativa
proteções da aplicação nem aplica retry a operações com efeito.

## Resultados finais

| Verificação                        | Resultado                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Regressão geral `npm test`         | 128 arquivos aprovados; 1.131 testes aprovados; 6 arquivos/91 testes opcionais não executados pela configuração desta suíte |
| Unidades persona-v2                | 21 arquivos; 249 testes aprovados                                                                                           |
| Persistência persona-v2 PostgreSQL | 7 arquivos; 91 testes aprovados, sem skips                                                                                  |
| Chromium persona-v2                | 12 cenários aprovados, sem retries de teste nem skips                                                                       |
| Frontend                           | lint, tipos, 9 arquivos/27 testes e build aprovados                                                                         |
| Servidor                           | lint, tipos e build aprovados                                                                                               |
| Runtime e compilador               | Node 24.21.0 e TypeScript real 7.0.2 aprovados                                                                              |
| Documentação e formatação          | Verificadas localmente nesta revisão; sem rede/banco no checker documental                                                  |

As falhas intermediárias foram corrigidas: foco em campo ainda desabilitado,
seletor de cruzamento no teste e excesso de logins da suíte. A rodada final passou
com as proteções preservadas. O ajuste final de foco foi revalidado nos cenários
de cadastro inválido e conflito. Uma tentativa sem TEMP/TMP de workspace falhou
na infraestrutura temporária do sandbox; a verificação usa diretório temporário
local sem modificar a aplicação. Avisos do bundler sobre comentários de terceiros
Zod não impediram o build; não foram alterados arquivos da dependência.

Foram verificadas larguras **360, 390, 768 e 1280 pixels**, sem rolagem horizontal
do documento no cruzamento. Tabelas têm contêiner rolável e acessível por teclado.
A inspeção visual anterior da marca/cadastro também cobriu essas larguras.
**Zoom real de navegador a 200%, avaliação por leitor de tela e aceite integral de
acessibilidade continuam pendentes**; mudar viewport não é evidência de zoom.

## Fingerprints selecionados do candidato local

| Arquivo                                       | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `web/src/persona-v2/FederationPanel.vue`      | `a2ce1186b95adde39be77d089ffd87a166a0a07df45bc0de4fd6a5aab78f308d` |
| `web/src/persona-v2/SourceSettings.vue`       | `93ac4eaa396491f82cae5478ea017de8ce5f6b0196d3e9661c7e8e8e5f8d8746` |
| `src/infrastructure/http/persona-v2-admin.ts` | `a580e8e5258fd06f90fceb77828eaa18781a7bc6f3ee97f452bd3da5a83e2d9a` |
| `contracts/persona-v2-release.json`           | `212dc6bb71232a8bdb8ffe57e5ac78cd21c152b5383ef8689d3c8df55ed0cbcd` |

Os hashes não constituem manifesto completo de release. A correspondência dos
seis assets com Icon Kitchen está no [contrato do console](../console.md#identidade-oficial-e-empacotamento).

## Limites e bloqueio mantido

Não foram certificados: execução persistente completa nos quatro motores,
TLS/autoridade real, inspeção/compatibilidade/adoção de padrões, perfis físicos,
curadoria completa, editor/publicação de cruzamentos/operações/ações externas,
runners genéricos, concessões administrativas/delegação completas, OAuth/setup,
REST/MCP remoto, preparação/execução/cancelamento/conciliação pelo console,
cache/anexos/worker/retenção/rotação de cofre, imagem candidata e corte coordenado.
Não houve avaliação de IA consumidora.

Os skips opcionais da regressão geral não suprem esses ambientes e não aprovam
gates. O manifesto conserva **`ready: false` e `completedGates: []`**.
A entrada principal/worker legados permanecem preservados. Nenhuma evidência desta
rodada autoriza deploy ou uso de fontes reais em testes de escrita.
