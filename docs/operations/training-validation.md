# Verificação da evolução do treinamento

Rodada local em 2026-10-04, Node 24.21.0, TypeScript 7.0.2. Alterações no checkout `main`, preservando o trabalho local existente; nenhum commit, push ou deploy foi realizado nesta rodada.

| Verificação                                                              | Resultado                                                                                                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Windows: instalação/ferramentas, lint, formatação, tipos, testes e build | Aprovado; 834 testes, 94 arquivos, zero ignorados                                                                                        |
| Linux musl x64: npm ci, mesmos gates e integrações                       | Aprovado; 834 testes, zero ignorados                                                                                                     |
| PostgreSQL e Redis 7 reais                                               | Integrações aprovadas; banco CI isolado e Redis temporário                                                                               |
| Servidor, worker e sharp nativo                                          | Inicialização aprovada em Windows e imagem Linux de produção                                                                             |
| Migrações                                                                | Banco novo, upgrade desde 0023 e estado anterior 0031; idempotência, snapshots/Bearers preservados, sem confirmação/relatório retroativo |
| Contrato fixado do plug_server                                           | `contract:check` aprovado no commit 0d2c6b488438a77be71b39e514cd06ab11fbb95e                                                             |
| Base, adapter, schema público e contrato empacotado                      | `training:check` aprovado                                                                                                                |
| Harness dos 100 cenários                                                 | 15/15 segurança, 15/15 ambiguidade/lacuna, 70/70 suportados; `qualityMeasured=false`                                                     |
| Runner de casos por skill                                                | PostgreSQL real, decimais grandes exatos, recorte adversarial recusado, fixtures temporárias removidas                                   |

A suíte acrescentou 20 testes de treinamento, curadoria, semântica, exportação e runner ao baseline de 814. As integrações cobrem CAS de candidata/caso, replay, republicação durante confirmação, preservação de inatividade e relatório obsoleto. A distribuição pública foi verificada no protocolo moderno, mantendo a regressão legada.

Pendências externas antes de liberação: avaliação deliberada com modelos de IA reais e julgador de fidelidade, executores/resultados MSSQL, Sybase e Firebird, homologação em acesso piloto e procedimentos operacionais de produção. Não apresentar harness, parser ou build como certificação dessas pendências. A arquitetura não inclui jobs de fine-tuning ou infraestrutura de GPU.

Procedimentos e exemplos: [treinamento](../product/training.md). Relatórios temporários foram gerados fora do repositório, sem dados reais do ERP. O PostgreSQL original do desenvolvedor foi preservado; somente o banco de avaliação efêmero e o container Redis criado para esta rodada são removidos ao final.
