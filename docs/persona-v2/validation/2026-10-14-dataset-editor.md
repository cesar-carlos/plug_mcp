# Dataset por formulário e importação UTF-8 — 2026-10-14

Evidência parcial dos gates de conhecimento compartilhado, treinamento e console.
Nenhum gate encerrado. `ready: false`, catorze gates exigidos e nenhum concluído.

## Escopo e revisão

MCP no commit-base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações
locais preservadas. O [inventário desta rodada](2026-10-14-dataset-editor-files.json)
fixa SHA-256 dos arquivos afetados; não é commit upstream, snapshot integral ou
certificação do candidato de produção. Hub e agente não foram alterados nesta
tarefa. Nenhuma migration foi criada ou modificada.

Biblioteca existente permanece cifrada/versionada e autorizada por catálogo.
O formulário cria dataset com ID/versão/hash exatos do template, proveniência,
campos livres e valores tipados. Preserva decimal textual, booleano, nulo e
edição pendente. Reabrir a mesma versão mediante descarte explícito também limpa
o formulário. JSON permanece disponível, inclusive para editar versões existentes.

Servidor valida comprimento lógico de texto em pontos de código Unicode, sem
truncamento ou promessa de equivalência ao charset nativo. Declarações inválidas
são recusadas mesmo sem linhas. Navegador recusa arquivo DDL com UTF-8 inválido,
sem substituição de caracteres. DDL continua sendo interpretação sem execução,
prova técnica ou aprovação semântica.

## Verificações

Node 24.21.0, TypeScript nativo 7.0.2, PostgreSQL 17 de fixture e Chromium.

| Verificação                                    | Resultado                            |
| ---------------------------------------------- | ------------------------------------ |
| Unitários persona-v2                           | 393/393, 33 arquivos                 |
| Biblioteca e administração delegada PostgreSQL | 43/43, 2 arquivos                    |
| Console: lint, tipos, testes e build           | Passou; 32/32 testes, 11 arquivos    |
| Lint backend, TypeScript 7 e build backend     | Passaram                             |
| Chromium: template → rascunho → dataset → DDL  | 1/1 cenário passou                   |
| Layout do formulário em 360/390/768/1280 px    | Sem rolagem horizontal global        |
| Validador de publicação                        | Recusou, conforme o bloqueio vigente |

O cenário Chromium verifica candidatos sem autoridade herdada, ausência de campos
pessoais/tipos ambíguos no seletor, inteiro inseguro, texto excessivo recusado pelo
servidor com edição preservada, decimal exato, booleanos e nulos. Testa proteção
ao navegar/reabrir versão, descarte explícito e arquivo DDL inválido em UTF-8.
Screenshot local do formulário foi inspecionado; não é avaliação completa de
acessibilidade, leitor de tela ou zoom real de 200%.

Primeiras tentativas identificaram problema de seleção do cenário no comando,
tipo readonly do teste e identificação do seletor booleano. Foram corrigidos e
o cenário final passou. O primeiro `web:check` encontrou ENOENT no cache SSR
temporário do sandbox; repetição com TEMP/TMP privados do projeto passou inteira.
Não houve skip de cenário obrigatório para contornar essas falhas.

## Isolamento, limpeza e limites

PostgreSQL descartável criado com nome aleatório `se7e_library_*_test`, label
própria e porta loopback. Testes criam/removem seus bancos dedicados. Após a
rodada, container, volume próprio e manifesto com credenciais foram removidos,
com alvo/label conferidos. Nenhuma fonte, credencial ou banco do usuário foi usado.

Chromium usa autoridade sintética do hub e persistência PostgreSQL real de
fixture. Esta rodada editorial não executou MCP → hub → agente nos quatro
motores, agente desktop, plugin real, integrações, runners genéricos ou avaliação
da IA. Não reaproveita evidências anteriores como aceite dessas capacidades.
Gestão/leitura delegadas gerais da biblioteca e runners continuam no
[plano restante](../remaining-plan.md). Deploy e publicação permanecem bloqueados.
