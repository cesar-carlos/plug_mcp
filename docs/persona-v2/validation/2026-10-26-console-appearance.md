# Console: aparência e recuperação — 2026-10-26

## Escopo e revisão

Rodada local no Windows, com Node 24.21.0, sobre alterações ainda não commitadas
da interface v2, com base no commit `f521585d40e9a844984b143101b928676614d519`.
A evidência descreve a árvore de trabalho desta conversa, não
um artefato imutável de CI ou o estado do servidor remoto.

Inclui navegação agrupada, edição recolhida, ícone salvo no resumo, descarte local,
recuperação de conflito sem perder o arquivo e galeria comunitária com seleção,
download PNG e pacotes separados das instruções de uso no ChatGPT/Codex.
Contrato funcional e limites: [console](../console.md).

## Verificações concluídas

| Verificação                                                                                                    | Resultado e alcance                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npx playwright test --config playwright.persona-ui.config.ts --output test-results/ui-appearance-refinements` | 20 testes aprovados. Interface real compilada, APIs simuladas; não certifica o backend remoto. |
| `npm run test --prefix web`                                                                                    | 87 testes aprovados em 23 arquivos.                                                            |
| `npx vitest run tests/unit/persona-v2/mascot-assets.test.ts`                                                   | 3 testes aprovados: hashes/licença, formatos e normalização dos retratos.                      |
| `npm run typecheck` e `npm run typecheck --prefix web`                                                         | Aprovados.                                                                                     |
| `npm run build --prefix web`                                                                                   | Build concluído, incluindo imagens e ZIPs locais.                                              |
| `npm run lint --prefix web` e lint do teste de ícone                                                           | Aprovados.                                                                                     |
| Formatação dos arquivos alterados e `git diff --check`                                                         | Aprovados; rules `.mdc` verificadas com parser Markdown.                                       |
| `npm run docs:check`                                                                                           | Sem problemas na rodada de implementação.                                                      |

A primeira execução dos testes unitários da interface falhou ao acessar arquivos
temporários (ENOENT em seis suítes). A repetição com acesso ao diretório temporário
concluiu todas as suítes; não houve alteração de código para contornar os testes.

Os testes de navegador cobrem conflito de revisão, falha e recuperação da releitura,
ausência de reenvio automático, descarte sem requisição, escolha pendente separada
do ícone salvo, downloads, teclado, foco, contraste do botão selecionado,
movimento reduzido e reflow com fonte ampliada a 200%. Não constituem auditoria
integral de acessibilidade nem validação manual de instalação no ChatGPT.

## Publicação e limites

### Continuação da etapa 13

A rodada posterior acrescentou associação acessível das recusas do servidor aos
campos da edição da persona. O cenário verifica foco após desbloqueio, texto
preservado, descrição acessível, reabertura da seção pelo link de erro e limpeza
das referências após salvamento confirmado. Erros são vinculados ao formulário
que enviou a requisição, sem inferência pelo texto da mensagem.

`npx playwright test --config playwright.persona-ui.config.ts --output test-results/plan-ui-validation`
concluiu 21 testes, incluindo os 20 da rodada anterior; não somar esses totais.
Build da interface, typecheck do servidor/interface, formatação e validação
documental passaram novamente. APIs permanecem simuladas nesta suíte; nenhuma
nova evidência de backend ou de motores SQL é atribuída a essa alteração de UI.
O plano restante foi reconciliado com o primeiro deploy já realizado e conserva
as pendências de datasets para operações/cruzamentos e de avaliação consumidora.

### Estado da publicação

Esta rodada não executou commit, push ou deploy. A migração 0045 precisa acompanhar
a atualização conjunta de backend e frontend pelo [fluxo de teste](../first-test-deploy.md).
Não certifica aplicação dessa migration no servidor, imagem Docker nova, instalação
de Pet/Dot, motores SQL ou aceite integral para clientes. A configuração remota
e a revisão em execução precisam ser verificadas na próxima publicação.
