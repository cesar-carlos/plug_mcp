# Verificação da evolução do treinamento

## Revalidação após os merges — 2026-10-04

Fonte testada: `main` no commit `b0286e616f6162d700c061d94c993c3957262869`, Node 24.21.0 e TypeScript 7.0.2. Os resumos abaixo registram a rodada posterior aos merges e à revisão do changelog.

| Verificação              | Resultado                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Windows e Linux musl x64 | 834/834 testes em cada ambiente, 94 arquivos, zero ignorados; PostgreSQL e Redis 7 reais isolados                                   |
| Gate de release          | Compilador, base comum, lint, formatação, tipos e build aprovados nos dois ambientes                                                |
| Migrações                | Banco novo, upgrades desde 0023 e estado anterior 0031, reaplicação idempotente e preservação de autoridade/curadoria aprovados     |
| Runtime                  | Servidor ready, worker em execução e imagem PNG nativa aprovados em Windows/Linux                                                   |
| Contrato do hub          | `contract:check` aprovado no checkout fixado `0d2c6b488438a77be71b39e514cd06ab11fbb95e`                                             |
| Suíte live               | 1/1 teste de login e policy aprovado no hub, com conta dedicada de homologação confirmada pelo usuário; sem consulta a dados do ERP |
| Projeto mcp_test_agente  | 35/35 testes em Windows/Linux; runner PostgreSQL com 2/2 casos e harness com 100/100 cenários, `qualityMeasured=false`              |

O [CI do commit testado](https://github.com/cesar-carlos/plug_mcp/actions/runs/37236711491) terminou aprovado. O manifesto sintético da integração é `96bbc3cf-af15-4c56-9902-9aa21f2c0f02`, mantido localmente no projeto de testes. A primeira tentativa da suíte do agente em Linux usou uma cópia sem Git e falhou nos manifestos; a repetição com snapshot Git passou integralmente, sem alteração de código.

Containers, bancos e rede temporários foram removidos; o PostgreSQL do desenvolvedor foi preservado. Modelos reais de IA e resultados dos motores MSSQL/Sybase/Firebird continuam sem avaliação nesta rodada. Nenhum deploy foi realizado.

## Rodada anterior — implementação do treinamento

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
