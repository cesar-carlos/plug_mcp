# Importação editorial delegada e múltiplos exemplos — 2026-10-14

Rodada local do MCP persona-v2. Não encerra gates nem certifica os quatro motores.
Contrato: [biblioteca editorial](../knowledge-library.md). Pendências:
[plano restante](../remaining-plan.md). Deploy e publicação continuam bloqueados.

## Revisão e alcance

Commit-base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preexistentes preservadas. O [inventário](2026-10-14-library-delegated-import-files.json)
fixa os bytes dos arquivos relacionados a esta entrega e seus inputs de build;
não é commit, snapshot completo dos três projetos ou aceite de produção.
Node 24.21.0 e TypeScript 7.0.2 real. Contrato do hub permaneceu fixado; nenhuma
alteração no hub/agente, migration aplicada ou entrada principal nesta tarefa.

Entregue:

- `criar_rascunho_de_template` e rotas Bearer/OAuth de importação exata usam a
  unidade administrativa existente: treinar, teto vigente do hub, consentimento,
  fonte concedida e papel editorial do responsável no catálogo. Fonte é conferida
  antes da procura do material. Não há listagem da biblioteca pelo consumidor.
- Template/versão/hash e dataset opcional são explícitos. Dataset é revalidado
  contra o template sem retornar linhas; rascunho, origem e auditoria compartilham
  a transação. Nenhuma publicação, caso, relatório ou concessão é herdada.
- Modelo e até 99 exemplos adicionais são selecionados explicitamente. Exigem
  variante no dialeto escolhido e parâmetros compatíveis; todos ficam candidatos.
  Console limpa seleção adicional ao trocar modelo/dialeto.
- DDL estrutural conserva precisão/escala e comprimento no tipo lógico declarado,
  sem executar, provar existência ou confirmar semântica. O dataset revisado
  respeita o limite decimal conservado. Campos inferidos/constraints desconhecidas
  continuam sem habilitar execução.

## Verificações executadas

| Verificação                        | Resultado                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| Regressão MCP completa             | 1.244 passaram; 91 opcionais não executados; 139 arquivos passaram e seis opcionais |
| Unitários persona-v2               | 330/330                                                                             |
| Persistência persona-v2 PostgreSQL | 193/193, treze arquivos                                                             |
| Frontend                           | Lint, tipos, 31/31 testes e build local passaram                                    |
| Chromium do console                | 22/22; cenário da biblioteca também repetido isoladamente                           |
| Backend                            | Lint, tipos com TS 7 e build local passaram                                         |
| Node/compilador e contrato fixado  | Verificações passaram                                                               |
| Documentação/formatação            | Verificações passaram nos arquivos tocados                                          |
| Guard de release                   | Recusou publicação, como esperado: ready false, quatorze gates pendentes            |

PostgreSQL 17 em container novo, restrito ao loopback e exclusivo da tarefa.
Suítes persistentes criam/removem seus bancos `_test`; os bancos do navegador
ficaram dentro do container descartado ao final. Nenhum banco/credencial operacional
foi utilizado. Autorização remota nos testes de administração e navegador é
sintética: não comprova autoridade persistente do hub ou instalação do agente.

Casos específicos incluem importação via MCP/HTTP, OAuth com fonte ou treinar
ausentes, concessão revogada, catálogo de outro responsável sem acesso ou revogado,
outra persona/fonte, hash incorreto e autoridade indisponível. Exemplos incompatíveis
ou ausentes são recusados, sem criação parcial. Exemplos candidatos impedem
publicação; auditoria/origem não incluem conteúdo operacional.

A primeira regressão ampla dentro do sandbox encontrou bloqueios de portas
locais, links de fixture e Git; repetição autorizada passou integralmente.
Expectativas novas foram corrigidas para preservar os contratos existentes
(503 de autoridade indisponível, 409 de treinamento e grants OAuth imutáveis).
Atualizada a versão esperada do guia; seletor Chromium passou a identificar
explicitamente o checkbox. Nenhum controle de produto foi afrouxado.

## Limites e continuidade

- Esta rodada não executou a cadeia nativa MCP → hub → agente nos quatro motores.
  Testes de parser dos quatro dialetos não substituem essa homologação. Relatórios
  anteriores continuam históricos, sem certificar automaticamente este candidato.
- Gestão/leitura delegadas gerais da biblioteca, runners genéricos que consumam
  datasets autorizados, adoção compartilhada em DML e demais gates permanecem
  pendentes. A interpretação DDL continua no console autenticado e nunca executa.
- Chromium verificou a seleção e as larguras previstas no cenário; não comprova
  leitor de tela real, zoom real de 200% ou avaliação da IA consumidora.
- Container e bancos desta fixture foram removidos após a rodada; nenhum recurso
  preexistente foi removido. Não houve commit, push, imagem publicada ou deploy.
