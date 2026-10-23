# Sementes de dataset no editor e runner — 2026-10-22

Entrega inicial de integração editorial: carregar explicitamente sementes do
dataset associado à importação do template, revisar no formulário e salvar um
caso separadamente. Não cria relatório ou aprovação semântica e não executa SQL
ao carregar. [Contrato](../knowledge-library.md#preparar-sementes-de-um-caso-de-consulta).

## Comportamento e persistência

POST administrativo `sementes-dataset` exige sessão Client/CSRF, persona ativa,
revisão corrente, fonte/versão/dialeto de origem e papel editorial atual no
catálogo. Dataset/template são recuperados pelas versões exatas e revalidados
por hash, integridade e tipos. Linhas não são expostas por tools ou rotas de
consumidor Bearer/OAuth. Não altera revisão, caso, relatório ou publicação.

O registro `knowledge_library_draft_origin_v2` existente é lido sob a transação
autorizada; nenhuma migration aplicada foi alterada ou nova tabela adicionada.
Fonte alterada e acesso ao catálogo revogado recusam nova carga. Sementes já
em edição são conservadas quando a nova leitura falha; substituir exige escolha
explícita. Nome, parâmetros, resultado esperado e campos gerados exigem revisão.

## Testes locais

- Oito testes unitários aprovados: nomes exatos dos três dialetos, precisão
  inteira/decimal, nulo/Unicode/booleano/data, limites, campo removido/sensível,
  view e ponto flutuante recusados sem conversão/truncamento.
- Arquivo completo de integração editorial PostgreSQL: **21 aprovados**, sem
  filtro. Inclui sessão, CSRF, outra pessoa, revisão, ausência de mutação ao
  carregar, salvamento separado, fonte alterada e revogação do catálogo.
- Dois cenários Chromium aprovados: carga do dataset com edição/recusa e
  regressão de edição, conflito e remoção de casos. Contexto, revisão e valores
  são conferidos pelo servidor; o teste de recusa visual usa resposta controlada.
- A abertura da origem em 390 px reproduziu rolagem horizontal. Corrigida com
  a classe de quebra de valores técnicos existente; repetição móvel aprovada
  com hashes abertos e preservação do decimal. Viewport não certifica leitor
  de tela ou zoom real.
- `web:check`: lint, tipos, 86 testes e build aprovados; typecheck raiz, lint e
  formatação dos arquivos de código alterados aprovados.

Os primeiros cenários novos falharam por SQL de fixture sem schema correspondente,
expectativa de status/rótulo diferente dos controles existentes e escopo incorreto
do aviso. Corrigidos os testes sem relaxar schemas, autoridade ou validação SQL.
A falha móvel foi corrigida no componente. O código final não foi certificado
pela rodada completa anterior de 54 Chromium/79 cenários: são revisões diferentes.

Logs locais ignorados em `node_modules/.cache/dataset-seeds-*`. Fixtures de controle
e dados são próprias, sem conexão, credencial ou conteúdo operacional do usuário.

## Imagem e cadeia real

Imagem final somente local:
`se7e-persona-v2-candidate:dataset-seeds-mobile-20261022`, ID
`sha256:fb8b1e4da999e60d50c3627e8dfaf40c49ed8afaa126392623452a9a96f352b6`.
Não houve push, deploy ou substituição da entrada legada.

Uma rodada anterior dirigida passou em três publicações genéricas, com 76 casos
fora do filtro. A segunda incluiu três inspeções e três publicações, passou em
seis casos e preservou versões. Após corrigir a quebra móvel, uma terceira
rodada utilizou a imagem final acima: **seis aprovados, 73 fora do filtro**, em
83,49 segundos, início 15:39:31 (America/Cuiaba). O wrapper retornou zero,
`unchanged: true`, `testExitCode: 0`, `result: passed` e confirmou limpeza da
fixture. Não é uma nova rodada integral de 79 casos.

Versões observadas pelas inspeções nativas nessa rodada final:

| Motor        | Versão observada |
| ------------ | ---------------- |
| PostgreSQL   | `17.0.11`        |
| SQL Server   | `16.00.4236`     |
| SQL Anywhere | `16.00.0000`     |

O helper de operador cria template/dataset sintéticos e importa rascunho com
origem. Depois registra revisão explícita do exemplo artificial, carrega sementes,
salva casos e executa o runner em fixture privada pela cadeia MCP → hub Prisma →
agente → motor. O runner não lê catálogo implicitamente nem executa SQL de
provisionamento enviado pelo consumidor. Os casos mantêm SELECT adaptado,
resultados vazios, DML, constraints e rollback do runner genérico existente.

Inventário antes/depois idêntico da rodada final:

| Projeto | Commit-base                                | SHA-256 dos arquivos efetivos                                      | Arquivos |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| MCP     | `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` | `8576cd7aed81664504d97c3cdd5708f8eba314951aae95c3cb6bcb2f2be0cbe3` | 1093     |
| Hub     | `0dc94d6990167f65e093b1fb68a8150630e2057c` | `15f380aaca62b8953de11898c21602e3818cd821fad65e275dfb55d8a5baabba` | 1024     |
| Agente  | `3b4f099e64a319a100cd93e00667ffca4afef732` | `b2b2f82798d683cbab2270fcf6b3e60911afad89d943911cc6ebdf3f5bfd3ecb` | 2670     |

São snapshots de alterações locais, não commits novos. Alterações documentais
finais posteriores não são certificadas retroativamente por esse inventário.

Drivers da configuração da fixture final, conferidos durante a execução; não
são prova de rastreamento de carregamento de DLL por chamada:

| Arquivo           | Versão do arquivo                           | SHA-256                                                            |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `podbc35w.dll`    | `18.00.0000`                                | `452afccffb9b7ffbdb736b8ba1cba9d7b1e11b09ffaee9cf85d6d3788cace991` |
| `dbodbc16.dll`    | `16.0.0.2043 (64-bit)`                      | `571e105fb3e14e754b16863739d402022d0e1f64a10d0b224c4e6dd429d5e8be` |
| `msodbcsql18.dll` | `2018.0186.0001.01 ((DS_Main).170626-2112)` | `b510668814e68df5018f6f3de0d203fd9b8628b1901d46ed3762ee263b87bbbb` |

## Limites e continuidade

Não conclui integração de datasets com operações/cruzamentos, seleção de outra
origem, linhagem editorial persistente por caso, matriz completa do candidato,
ciclo instalado, avaliação da IA ou gates de liberação. HTTPS e ChatGPT continuam
manuais. O manifesto permanece `ready: false` e não recebeu gates aceitos.
