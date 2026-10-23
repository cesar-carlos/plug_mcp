# CHECK, cascatas e triggers UPDATE/DELETE — 2026-10-15

Evidência parcial de desenvolvimento. `ready: false`, treze gates requeridos,
nenhum encerrado. Não autoriza deploy, imagem ou corte.

## Implementação

O manifesto privado admite CHECK `integer_range` com limites textuais int64 e
coluna inteira existente. Não aceita expressão SQL, script, limite invertido
ou fora do intervalo. FK admite `onUpdate`/`onDelete`: `no_action` ou `cascade`,
mantendo pares ordenados e alvo anterior PK/UNIQUE compatível.

Triggers fechados `updateAudit`/`deleteAudit` copiam NEW/OLD para destinos distintos
de layout idêntico, sem outros triggers. INSERT preserva o comportamento anterior.
Seeding usa INSERT normal, sem disparar UPDATE/DELETE. Companion valida antes de
conectar, confere banco descartável, cria somente DDL fixo por motor e recria
tabelas/constraints/triggers depois de casos terminais. Não há novo RPC público,
migration ou alteração de contrato de transporte. SQL dos casos passa pela cadeia
MCP → hub → agente; DDL de fixture é exclusivo do companion privado.

As expectativas de erro continuam exigindo `rollback_confirmado`, categoria
`SQL_OPERATION_NATIVE_FAILED` e todas as sementes intactas. Timeout/transporte ou
efeito incerto não aprovam o caso nem permitem retry. Contagem direta é conferida
separadamente das linhas alteradas por cascata ou criadas por trigger.

## Matriz nova

| Família                 | Casos obrigatórios por motor                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| CHECK INSERT            | Limite inferior, superior, NULL permitido, abaixo/acima do intervalo            |
| CHECK UPDATE            | Alteração válida e violação preservando a linha anterior                        |
| UPDATE CASCADE composto | Sucesso em dois filhos, falha posterior e CHECK descendente recusando a cascata |
| DELETE CASCADE composto | Dois filhos removidos; falha posterior restaura pai e filhos                    |
| Trigger UPDATE          | Cópia da imagem nova e erro no destino desfazendo a alteração                   |
| Trigger DELETE          | Cópia da imagem antiga e erro no destino restaurando a linha                    |

Cascatas mantêm um pai homônimo e filho de outro tenant intocados. NULL no CHECK
é permitido por coluna nullable: demonstra UNKNOWN nativo, sem substituir NOT NULL.
As operações positivas de cascata alteram diretamente um pai e inserem uma linha
de CHECK, portanto retornam duas linhas diretas; os dois filhos são efeitos
indiretos. Trigger altera diretamente uma linha, com uma cópia indireta conferida
separadamente. São **48 novos casos obrigatórios** em dezoito publicações.

## Validação

- **490 unitários v2** passaram, incluindo compilação das seis famílias nos três
  dialetos, recusa de injeção/intervalos inválidos/ações desconhecidas e destinos
  de trigger conflitantes. Refinamento valida a gramática antes de converter
  limites a BigInt; entrada inválida produz recusa estruturada.
- **195 integrações PostgreSQL** passaram. Node **24.21.0**, TypeScript **7.0.2**,
  tipos, lint/build/formatação e análise do companion verificados.
- Primeira cadeia: **44/73**, **528,41 s**, fixture `se7e_persona_3ca40220c35a_test`.
  O volume ampliado atingiu limites de getPolicy e autenticação. Falha após
  dispatch/conferência tornou fixtures inutilizáveis; cenários seguintes foram
  recusados, sem retry ou falsa aprovação. Não foi aceite de CHECK/cascatas.
- Corrigida conferência: uma autorização para o conjunto exato, revalidação
  antes/depois de cada SELECT e ritmo explícito entre checagens por agente.
  Nenhum cache de policy/resultados ou alteração dos limites do agente.
  Host de teste reutiliza gateways reais/sessões em memória por credencial/versão;
  CLI separado conserva composição própria. Testes cobrem revogação entre leituras.
- Segunda cadeia: **33/73**, **504,01 s**, fixture
  `se7e_persona_7c035b2b234e_test`. CHECK e UPDATE CASCADE passaram nos três motores,
  mas o limite global de 1.200 RPC/minuto também contabiliza identidade; ainda
  houve RATE_LIMITED em describeSource. O companion encerrou após oito minutos,
  causando indisponibilidade e falhas derivadas. Não houve aprovação integral.
- Correção seguinte: contagem exata em uma consulta de todas as tabelas, leitura
  integral das não vazias, checagens espaçadas em 200 ms e revalidação mantida.
  Sessão privada do companion ampliada para doze minutos e teste para catorze,
  sem mudar prazos SQL/administrativos/aprovação. Limites RPC seguem ativos.
- Terceira cadeia, fixture nova `se7e_persona_a3fc2522dcac_test`: **73/73**,
  **578,40 s**, com PostgreSQL/Prisma no hub, cofre e configuração persistentes
  do agente. As dezoito publicações novas aprovaram os 48 casos obrigatórios;
  autorização, identidade, cruzamentos, journal e reinícios anteriores também
  passaram. Repetidas **195 integrações PostgreSQL** após a correção.
- Versões observadas por RPC: PostgreSQL `17.0.11`, SQL Server `16.00.4236` e
  SQL Anywhere `16.00.0000`. O [inventário](2026-10-15-publication-effects-files.json)
  registra arquivos, commits-base, motores e drivers após a rodada.
  É inventário parcial de checkout sujo, sem hashes anteriores registrados nele;
  não é snapshot integral de release.
- Hub e agente incluíram otimizações desenvolvidas em outros chats. Os seis
  arquivos de transporte do hub e os três arquivos ODBC do agente conservaram
  os hashes comunicados antes da rodada. O hub recebeu commit/push autorizado
  em outro chat durante a execução, sem mudança dessas fontes, companion ou
  contratos; o inventário identifica o commit-base posterior separadamente.
  Neste chat não houve commit, push, publicação de imagem ou deploy.
- As três fixtures foram removidas pelos scripts de ownership. Nenhuma fonte
  cadastrada pelo usuário recebeu escrita. Não houve nova homologação de UI,
  plugin real, instalador ou IA consumidora. Tipos, lint, build, formatação,
  `docs:check`, Node e TypeScript passaram; o guard de release recusou a
  publicação como esperado, com treze gates requeridos e nenhum encerrado.
- `training:check` passou antes de iniciar a cadeia. Após o commit do hub em
  outro chat, a repetição recusou `HEAD` diferente da referência fixada
  `bfb40becd42c5452b19b0df13698d212a0238ddc` (atual
  `46dd40bbae0ca407821ec33de3bfe4108d407faf`). O hash do contrato continuou
  igual; o verificador exige também o commit exato. Referência, snapshot e
  verificador foram preservados. Revisão coordenada desse vínculo permanece
  pendente; os checks locais aprovados não significam todos os gates verdes.

## Limitações

Não certifica expressões CHECK arbitrárias, SET NULL/DEFAULT, ciclos ou múltiplos
caminhos de cascata, triggers BEFORE/INSTEAD OF, recursão/encadeamento, imagens
OLD e NEW combinadas em um único log, multirow geral, collations ou todos os modos
de isolamento. Não amplia inspeção `sourceSchema` para provar CHECK publicado.
Conhecimento compartilhado executável, console de casos/relatórios, imagens,
plugin real, instalador e avaliação da IA continuam com aceite próprio.
A cadeia usa contratos locais candidatos com extensões v2. Verificação contra
baseline local não certifica compatibilidade do contrato publicado anterior;
essa evidência exige comparação fixada ao upstream e regressões específicas.
Nenhum baseline será atualizado somente para ocultar incompatibilidade.

A gramática do companion é fixa por motor; referências:
[triggers SAP](https://help.sap.com/docs/SAP_SQL_Anywhere/e38b2f6217f24bdb90a3ff8ae57b1dd5/818f8b2c6ce21014be6dfa4b15caab5e.html),
[integridade referencial Microsoft](https://learn.microsoft.com/en-us/sql/relational-databases/tables/primary-and-foreign-key-constraints?view=sql-server-ver16).
Essas referências não substituem a validação nos motores registrados.

Contrato: [homologação](../homologation-chain.md).
Continuidade: [plano restante](../remaining-plan.md) e [aceite](../acceptance.md).
