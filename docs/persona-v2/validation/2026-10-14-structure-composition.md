# Inspeções paginadas e descoberta estrutural do hub

Rodada de 2026-10-14, America/Cuiaba. Avanço das etapas 4/13 do
[plano restante](../remaining-plan.md). Não houve branch, commit, push, imagem
publicada ou deploy. Os três manifestos conservam `ready: false`, catorze gates
exigidos e nenhum concluído.

## Implementação

[Contrato](../shared-knowledge.md#composição-de-páginas): composição explícita por
IDs de páginas vigentes, mesma persona/fonte/identidade/credencial/versões/escopo,
sem lacunas ou sobreposição. Migration aditiva 0022 fixa linhagem imutável com
FKs que vinculam esses atributos e hashes. Migrations aplicadas anteriores não
foram alteradas. O prazo é o menor das páginas, sem renovação implícita.

Console mantém páginas em memória, combina somente por ação explícita, mostra
origem/horários e descarta prova ao mudar o escopo/contexto. HTTP mantém sessão,
Host/Origin e CSRF. MCP oferece `compor_inspecoes_estrutura` somente com treinar,
delegação/consentimento vigentes e fonte concedida; chamada direta não contorna
autorização. Policy, vínculo, identidade e sourceSchema v1 são revalidados pelo
hub; versões/concessões/prazos locais são conferidos antes do commit.

Cobertura e constraints desconhecidas não são completadas por inferência.
`composed` não significa compatível, executável ou semanticamente aprovado.
Comparação, publicação de perfil e adoção de consulta continuam separadas.
Composição preserva cada horário, sem snapshot simultâneo. Revalidação pode ler
metadados fixos de identidade; não repete a inspeção de esquema ou executa SQL
de negócio. O RPC mantém quatro recursos por página; envelope interno até dezesseis.

## Correção coordenada do hub

O detalhe autenticado do agente omitia sourceSchema/sourceConstraints apesar
de o bridge aceitar a inspeção. Agora projeta somente versão 1 do registro local
vigente; ausência, desconexão e versão incompatível resultam em null. Permissões
não são inferidas de suporte técnico. Os portões de dispatch permanecem intactos.

Também foi corrigido o OpenAPI efetivo: a definição canônica de agente acessível
existia em um módulo não utilizado pelo schema principal. O principal agora a
referencia, documentando capacidades opcionais sem remover campos anteriores.
Contrato/baseline 1.13.0 foram regenerados e revisados; requisições e demais
contratos não mudaram. O MCP consome bytes e patch reproduzíveis:

- Commit-base do hub: `bfb40becd42c5452b19b0df13698d212a0238ddc`.
- Contrato: `0257b75fe8ec2a10a3b43d7f454884b23bc24b64c941e83e545dba1f135f9457`.
- Patch: `e6bf46538a24b7da33ac1f1815322312a28f2ad3f856fbf415ae7d6db509f99e`.

Snapshot não é commit upstream. Base v2 avança para
`persona-v2-structure-composition-1`, com hash derivado; nenhuma instrução v2
foi transferida à entrada legada. Código de produto do agente não foi alterado
por este bloco.

## Verificações

| Verificação                           | Resultado                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Regressão MCP                         | 1.242 passaram em 139 arquivos; 91 opcionais em seis arquivos ignorados                    |
| PostgreSQL v2                         | 191 passaram em treze arquivos; arquivo de composição repetido: 7/7                        |
| Frontend                              | 31 passaram, lint, tipos e build                                                           |
| Chromium                              | 22 passaram; composição explícita, estados incompletos e descarte de prova incluídos       |
| Regressão hub                         | 2.170 passaram em 307 arquivos; vinte opcionais em três arquivos ignorados                 |
| Hub dirigido                          | 26 passaram em quatro arquivos: projeção, desconexão, OpenAPI efetivo e paridade do bridge |
| Cadeia persistente dos quatro motores | 30/30 em fixture nova após correção do hub                                                 |

Node 24.21.0, TypeScript 7 real, lint/tipos/build MCP, lint/tipos hub, contrato
gerado/baseline, `training:check`, documentação e formatação foram conferidos.
Opcionais não certificam motores/infraestrutura obrigatórios.

Persistência cobre seis recursos, origem imutável, menor validade, fonte/persona
divergentes, hash errado, lacuna, expiração, revogação em voo, mudança de fonte,
CSRF, descoberta/chamada MCP direta e publicação de skill com seis dependências.
Esses casos usam autoridade sintética; publicação local com seis recursos não
certifica execução nativa de escopos maiores que quatro.

## Cadeia real e versões observadas

`se7e_persona_01dc9860fea5_test`: PostgreSQL de controle MCP, hub PostgreSQL/Prisma,
autenticação e aprovação ClientAgentAccess reais, companion do agente com
Drift/cofre Windows DPAPI, Socket.IO, ODBC e journal. SQL de negócio passou
exclusivamente por MCP → hub → agente. Nenhuma fonte cadastrada pelo usuário,
cofre operacional ou DSN existente foi usado.

Cada motor inspecionou duas páginas de um recurso, compôs a evidência e adotou
seu ID numa publicação com recorte treinado. Ordem das chaves e constraints foi
preservada; SQL Anywhere continua com enforcement desconhecido. A suíte também
passou em templates/datasets, consultas, cruzamentos, DML treinado, aprovação,
conciliação pelo marcador, revogação e reinício dos três processos/journals.

Versões abaixo são as strings informadas na prova estrutural do agente; não
representam uma verificação independente de todos os níveis de patch do servidor:

| Motor        | engineVersion observado        |
| ------------ | ------------------------------ |
| PostgreSQL   | `17.0.11`                      |
| SQL Server   | `16.00.4236`                   |
| SQL Anywhere | `16.00.0000`                   |
| Firebird     | `06.03.1812 WI-V Firebird 5.0` |

| Driver/biblioteca | Versão de arquivo      |
| ----------------- | ---------------------- |
| podbc35w.dll      | `18.00.0000`           |
| msodbcsql18.dll   | `18.6.1.1`             |
| dbodbc16.dll      | `16.0.0.2043 (64-bit)` |
| OdbcFb.dll        | `2.0.5.156`            |
| fbclient.dll      | `5.0.4.1812`           |

Hashes dos drivers e IDs das imagens de fixture ficam no inventário abaixo.
Não são imagens candidatas de produção.

## Falhas anteriores e limites

- `se7e_persona_88de6cc61e5f_test`: 22 passaram e oito falharam porque a composição
  exigia a capability que o detalhe REST não projetava. Corrigido no hub, sem
  remover a exigência; rodada completa repetida em fixture nova passou.
- A primeira regressão MCP após o contrato novo falhou somente na expectativa
  antiga 1.12.0. O teste foi atualizado e ampliado para conferir o schema efetivo;
  regressão geral repetida passou. Ajustes de lint e do SQL sintético sem recorte
  foram corrigidos sem relaxar validadores.
- Uma tentativa inicial de geração não isolou corretamente dotenv e leu o .env
  local do hub. Não executou SQL ou dispatch; nenhum valor foi impresso. Seus
  artefatos foram descartados e regenerados com bloqueio explícito desse arquivo
  e ambiente sintético. A regressão final do hub usou esse isolamento sem alterar
  os ambientes próprios dos casos. A cadeia real usa cwd privado e whitelist de
  ambiente pelo runner canônico, sem carregar .env operacional.

Não se atribui retroativamente a esta correção a causa das falhas de reinício
das rodadas anteriores. A rodada nova passou, mas não certifica todas as janelas
de queda real durante commit. Perda de confirmação da fixture é injeção depois
do commit, não encerramento abrupto do processo nesse ponto.

Não encerra bootstrap/instalador desktop, TLS/Redis distribuídos, mínimos
privilégios, constraints SQL Anywhere, escopos nativos maiores que quatro,
adoção DML compartilhada, runners genéricos, leitor de tela, zoom real de 200%,
plugin privado ou avaliação da IA. Os demais itens do plano continuam pendentes.

## Candidato e limpeza

[Inventário](2026-10-14-structure-composition-files.json): revisões observadas,
hashes do recorte, motores, drivers e imagens. Alterações posteriores não são
certificadas; coleta não congela um checkout contra trabalho concorrente.
No fechamento foram observadas alterações concorrentes do agente em
`installer/setup.iss`, `lib/core/constants/app_version.g.dart` e `pubspec.yaml`.
Essas revisões de instalação/versão não são certificadas pela cadeia já encerrada;
o aplicativo desktop e sua distribuição continuam exigindo homologação própria.
Logs/manifestos de fixture com credenciais sintéticas permanecem fora dos docs.
As duas fixtures foram removidas por caminhos, processos, labels, volumes e DSN
verificados; a ausência das respectivas raízes foi confirmada. Nenhum reset
operacional ocorreu. Todos os gates permanecem pendentes; deploy bloqueado.
