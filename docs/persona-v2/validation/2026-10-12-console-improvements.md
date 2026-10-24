# Melhorias de roteiro, conexão, publicação e histórico — 2026-10-12

Evidência parcial de desenvolvimento. **Não conclui o plano de melhorias nem
qualquer gate de release.** `ready: false` e `completedGates: []` permanecem no
[manifesto](../../../contracts/persona-v2-release.json). Entrada principal,
worker e deploy não foram substituídos.

## Candidato e ambiente

Árvore de trabalho local, não commitada, sobre
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`. Havia alterações anteriores à rodada;
nenhuma foi revertida. Windows/PowerShell, Node **24.21.0**, TypeScript real
**7.0.2**, PostgreSQL **17.11** (`postgres:17-alpine`), Chromium
**153.0.8010.12**, Playwright **1.63.0**.

Hashes SHA-256 dos arquivos finais:

| Arquivo                                              | Hash                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `migrations/persona-v2/0008_console_history.sql`     | `4e3554c0403a7c19156801505947678fef2a6079f9a64cbe53c1b734c7eee3c9` |
| `src/application/persona-v2/publication-review.ts`   | `0ae38da45034faa469fbd954543b51bbede920e70ab6220ef74aff4984ca0b63` |
| `src/application/persona-v2/runtime-instructions.ts` | `420f5095165d6eb66fae16c8115ac09972abb8ce6795a4dc3b87f6a17edf2b4e` |

O contêiner tinha nome/etiqueta exclusivos e porta loopback. As suítes criaram
bancos aleatórios próprios. Hub, autenticação e execução do helper do navegador
são sintéticos; PostgreSQL de controle/fontes é real. Produto continua acessando
bases de negócio somente por plug_server/plug_agente. Nenhuma fonte cadastrada,
credencial operacional ou banco externo foi utilizado.

Após os testes, o contêiner exclusivo foi identificado novamente e encerrado;
`--rm` removeu seu armazenamento efêmero. O descritor da última fixture foi
removido após conferência de sua identidade. Não restou listener na porta do
console de teste. Não houve publicação de imagem ou deploy.

## Alcance implementado nesta rodada

- Roteiro de oito etapas derivado dos registros reais, sem marcação manual,
  treinamento privado sem catálogo obrigatório e separação entre histórico e
  disponibilidade remota atual. Permissões reutilizam o catálogo autorizado.
- Diagnóstico Bearer de publicações/dependências autorizadas; recursos omitidos
  não têm nomes revelados. Token expirado/revogado é recusado. Diagnóstico local
  não substitui portões remotos nem reserva acesso.
- Teste de conexão que confere persona e descoberta sem SQL; verificação da
  fonte é explícita e distinta da validação/execução de consulta. Mudanças de
  contexto descartam respostas antigas; cópia de instruções omite Bearer.
- Diagrama de relacionamentos com lista equivalente, chaves compostas e caminho
  N:N declarado; seletores de referências existentes e sugestões conservadoras
  de exemplos duplicados por dialeto, sem alteração automática do treinamento.
- Comparação de publicação gerada pelo servidor a partir dos pacotes exatos,
  conteúdo anterior/proposto, significado, SQL, parâmetros, regras, capacidades,
  casos e impacto transitivo. Nulo e ausência são distintos; reordenação de
  definições identificadas não cria alteração falsa. Preservados hash/CAS/prazo.
- Histórico de metadados paginado/filtrado, com autoria e versões efetivamente
  registradas. Mutações registram auditoria na própria transação. Cursores
  conservam microssegundos; cinquenta eventos por página e ordenação por horário/ID.
- Migration nova **0008**, sem alterar as sete anteriores. Acrescenta versões,
  índice e responsável transaction-local, sem backfill de autoria ou payload.
- Resumos de erro com foco nas áreas novas, quebra de identificadores longos no
  celular e datas em português com fuso visível. Marca e assets preservados.
- Instruções v2 separadas em módulo próprio de aplicação; corrigida orientação
  obsoleta que excluía o UUID SQL Anywhere já aprovado pela DV2-007. Legado intacto.

## Verificações

Comandos executados pelo runtime local do projeto; testes usam TEMP/TMP do
workspace. Conexões HTTP/PostgreSQL locais exigiram execução fora do isolamento
de rede do sandbox. Nenhum requisito ou teste foi desabilitado para passar.

| Verificação                                       | Resultado                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                        | 129 arquivos, 1.134 testes aprovados; 6 arquivos/91 testes opcionais não executados pela configuração geral            |
| `test:persona-v2` após ajuste final do comparador | 22 arquivos, 253 testes aprovados                                                                                      |
| `test:persona-v2:postgres` com migration 0008     | 7 arquivos, 94 testes aprovados, sem skips                                                                             |
| Manutenção PostgreSQL após otimização do roteiro  | 16 testes aprovados                                                                                                    |
| Chromium completo                                 | 13 cenários aprovados, sem retries de teste nem skips                                                                  |
| Chromium após último ajuste de datas/migration    | 2 fluxos afetados aprovados: percurso de duas fontes e conexão sem SQL/outra persona                                   |
| Frontend                                          | lint, tipos, 10 arquivos/28 testes e build aprovados; últimas alterações visuais rechecadas por tipos/build e Chromium |
| Servidor                                          | lint, tipos e build aprovados; alteração final do roteiro revalidada na integração de manutenção                       |
| Runtime/contrato                                  | Node 24.21.0, TypeScript 7.0.2 e `training:check` aprovados                                                            |
| Documentação/formatação                           | `docs:check`, Prettier e `git diff --check` aprovados                                                                  |

A regressão geral precedeu o último caso unitário de nulo/ausência; a suíte v2
foi repetida depois dessa alteração. Os skips da suíte geral não certificam ou
dispensam ambientes obrigatórios do aceite. Nesta rodada não foi executada a
cadeia operacional dos quatro motores.

O navegador percorreu persona vazia, duas fontes, publicação, token, descoberta,
consulta, histórico, troca de contexto, conflito, edição pendente, revogação,
cruzamento e revisão de operação. O cenário negativo observa as ferramentas
chamadas: conexão usa somente contexto/diagnóstico/fontes/capacidades e token de
outra persona interrompe após contexto. Recusa recebe foco acessível.

Persistência cobre isolamento entre responsáveis/personas, 53 eventos com o
mesmo timestamp em duas páginas sem perda, filtros inválidos, autoria/versões,
ausência de SQL/segredos no diagnóstico, suspensão de fonte e revogação.

Falhas intermediárias de sandbox (rede local/diretório temporário), seletores de
teste ambíguos e espera prematura do cenário de conflito foram resolvidas e
revalidadas. O teste sem concessões prepara o token pela API administrativa da
fixture; o formulário de emissão de consulta continua exigindo publicação.
Avisos do bundler sobre comentários Zod e notificações no transporte JSON do SDK
não impediram execução e não foram tratados como prova de funcionalidade adicional.

Histórico e cruzamento foram verificados em **360, 390, 768 e 1280 pixels**, sem
rolagem horizontal do documento. O histórico móvel foi inspecionado visualmente.
Arquivos do navegador ficam em `test-results/persona-v2`, ignorados pelo Git.
Viewport reduzido não representa zoom real a 200% nem avaliação por leitor de tela.

## Pendências do plano de melhorias

1. **Etapa 4 não implementada:** `sql.describeSchema`, capability `sourceSchema`
   v1, prova de estrutura na conexão executora, perfis físicos, conferência,
   composição e adoção executável de versões compartilhadas. Exigem alterações
   coordenadas MCP/hub/agente e fixtures dos quatro motores. O aviso na UI não
   conta como entrega; não houve fallback para treinamento copiado ou conexão direta.
2. Diagnóstico detalhado de cada portão remoto e todos os limites de skill/token.
   Hoje mostra autorização local, motivos bloqueados genéricos seguros e oferece
   verificação remota explícita por fonte. Não afirma reserva de autorização.
3. Biblioteca/editorial completa e casos/runners na interface, proveniência por
   item composto e revisão dos conflitos entre padrão/particularidade dependem
   da composição compartilhada. O diagrama não comprova metadados/semântica.
4. Eventos de adoção de conhecimento só existirão quando esse fluxo for entregue.
   Ausência de eventos antigos não é reconstruída. Histórico de catálogo mantém
   suas próprias concessões e permanece separado.
5. Erros por campo de todos os editores, acessibilidade com leitor de tela/zoom
   real, cadeia persistente dos quatro motores, avaliação separada da IA e
   demais pendências da plataforma continuam sem aceite.

Referências atuais: [console](../console.md), [trabalho restante](../remaining-plan.md),
[matriz](../acceptance.md) e [conhecimento compartilhado](../shared-knowledge.md).
