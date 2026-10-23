# Biblioteca editorial — constraints inline — 2026-10-14

Rodada local de implementação do [contrato editorial](../knowledge-library.md).
Não é aceite integral da plataforma nem homologação de execução nos quatro motores.
O runtime principal e suas migrations permanecem separados da persona-v2.

## Alterações

- Importador fechado aceita PK, UNIQUE e REFERENCES inline nomeadas, inclusive
  em sequência na coluna. Preserva nomes e pares; PK declara grão/nulabilidade.
- Nomes explícitos repetidos na mesma tabela, entre chaves/FKs ou CREATE/ALTER,
  recusam o arquivo inteiro. Chaves anônimas recebem IDs sem colisão com nomes
  explícitos posteriores. Não reescreve material persistido ou snapshots.
- Constraints permanecem `unknown`, campos `inferido` e respostas sem prova
  técnica/semântica. Importação não executa, salva ou publica automaticamente.
- Templates/datasets existentes mantêm cifragem, versões/hashes, autorização e
  candidatos; nenhuma aprovação ou concessão é herdada. Sem migration nova.

## Verificações

| Verificação                                        | Resultado                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Node do projeto / compilador                       | 24.21.0 / TypeScript 7.0.2                                           |
| Lint, tipos e build MCP                            | Passaram                                                             |
| Regressão unitária persona-v2                      | 354 testes, 32 arquivos                                              |
| Biblioteca unitária dentro da regressão            | 41 testes; gramática parametrizada nos quatro dialetos               |
| Integração PostgreSQL da biblioteca/conhecimento   | 19 testes, 1 arquivo                                                 |
| Chromium, jornada editorial completa selecionada   | 1 teste; template, dataset, arquivo DDL e larguras 360/390/768/1280  |
| Build do console                                   | Passou; avisos de anotação de dependência Zod, sem erro              |
| Documentação, formatação afetada e contrato fixado | Passaram                                                             |
| Guard de liberação                                 | Recusa esperada; `ready: false`, 14 gates exigidos, nenhum concluído |

O compilador inicialmente apontou mutação de ID readonly no novo helper. Corrigido
com transformação imutável, seguida de tipos/build aprovados. Verificação da base
técnica exigiu leitura autorizada do repositório irmão do hub; a primeira tentativa
restrita falhou por acesso ao diretório, e a repetição autorizada passou.

## Ambiente e limpeza

PostgreSQL 17-alpine local, container exclusivo
`se7e_library_0d161e6fd4904771b67bfc4e67008b18_test`, porta loopback aleatória.
Integração criou banco aleatório e o removeu. O servidor Chromium foi encerrado;
seus três bancos ainda existiam no container e foram removidos com o armazenamento
descartável. Container e volume exclusivos removidos; origem do volume conferida
pelos eventos de montagem e ausência de outros usuários. Nenhuma fonte, credencial,
cofre ou banco cadastrado pelo usuário foi utilizado.

## Limites

Testes da gramática por dialeto não executam DDL nem certificam sintaxe nativa,
compatibilidade, enforcement ou execução na cadeia MCP → hub → agente. Autoridade
do hub nos testes HTTP/Chromium é sintética. Não houve ensaio nativo nos quatro
motores, instalação do agente/plugin, avaliação da IA ou publicação de imagens.
Viewport não comprova leitor de tela ou zoom real. Runners genéricos e gestão/leitura
editorial delegadas restantes continuam no [plano](../remaining-plan.md).

Inventário do escopo e hashes: [JSON](2026-10-14-library-inline-constraints-files.json).
Alterações locais anteriores foram preservadas. Nenhum commit, push ou deploy.
