# Armazenamento compartilhado e recuperação de anexos — 2026-10-16

Evidência parcial de desenvolvimento; não encerra gates nem autoriza produção.
MCP base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, hub fixado em
`76950497dc386130e13b7d6afc0678e50208e985` e agente base
`7d00ae8a8f822605d76e775fb5659f27e29df539`, com alterações locais preservadas.
O [inventário SHA-256](2026-10-16-shared-attachments-files.json) identifica os
arquivos desta frente e dependências. Snapshot de arquivos não é commit.
Não houve branch, commit, push, publicação de imagem,
alteração de conexões ChatGPT ou deploy.

## Entrega

- Migration aditiva 0039 cria armazenamento operacional cifrado no PostgreSQL
  dedicado da persona-v2. Guarda hashes de handle, vínculo e origem; AES-GCM
  autentica também esses identificadores e o prazo. Copiar uma cifra a outro
  registro não transfere o arquivo. Não registra handle bruto ou conteúdo em claro.
- Composição v2 usa esse armazenamento por padrão. Instâncias com mesma origem,
  banco e keyring recuperam o mesmo arquivo depois de reiniciar, sem estender
  validade ou repetir SELECT. A implementação em memória fica nos unitários.
- Quotas transacionais cobrem todos os payloads retidos, inclusive expirados:
  oito arquivos/32 MiB por vínculo; 64 arquivos/128 MiB no banco inteiro.
  Falha do worker não permite acumular anexos expirados sem limite. Excesso recusa
  criação sem expulsar arquivos válidos; limpeza libera espaço.
- Worker temporário remove expirados em lotes com lease, locks e conferência do
  relógio do banco. Rotação de chave incorpora o novo alvo ao final do inventário,
  com simulação, retomada e guards imutáveis. Upgrade recusa rotação em andamento.
- Leituras recuperadas conservam revalidação de consumidor/concessão, versões,
  publicação, conhecimento, fonte/credencial, revisão física, policy, identidade
  e estrutura pelo hub/agente. Unknown/pending, revogação ou incompatibilidade
  impedem entrega. O armazenamento não concede autoridade.
- Rules, decisão DV2-011, contrato de anexos, worker/cofre, console, base técnica
  `persona-v2-shared-attachments-1` e skill privada foram sincronizados. Segredos
  continuam somente em memória no navegador; nenhum pacote/conexão foi instalado.

## Ambiente e rodada

Fixture final `se7e_persona_1bbc7d014e43_test`, sessão
`chain-103d2947cadd45558b29c8c5a3ffe0a6`. Hub PostgreSQL/Prisma separado do
controle MCP, autenticação Client e ClientAgentAccess reais de fixture, transporte
REST/Socket.IO/RPC, policy, ODBC, configuração Drift, cofre Windows DPAPI e
journals duráveis. Somente recursos loopback privados e credenciais sintéticas.
Nenhuma fonte, DSN, cofre ou base operacional foi utilizado.

O companion mantém a mesma porta/origem MCP durante o reinício. Não relaxa
Host/Origin ou o namespace do armazenamento. Casos binários usam a tabela
fechada binary_fixture, somente leitura, com BYTEA, VARBINARY(MAX) e LONG BINARY.
Downloads HTTP/MCP/resources preservam bytes originais, completude e proveniência.
Após reinício conjunto, a leitura do mesmo handle exige RPCs de autorização e
nenhum novo SELECT; token já revogado continua recusado.

Versões observadas via inspeção RPC: PostgreSQL `17.0.11`, SQL Server
`16.00.4236` e SQL Anywhere `16.00.0000`.

Drivers verificados por versão e SHA-256:

| Arquivo         | Versão            | SHA-256                                                            |
| --------------- | ----------------- | ------------------------------------------------------------------ |
| podbc35w.dll    | 18.00.0000        | `452afccffb9b7ffbdb736b8ba1cba9d7b1e11b09ffaee9cf85d6d3788cace991` |
| msodbcsql18.dll | 2018.0186.0001.01 | `b510668814e68df5018f6f3de0d203fd9b8628b1901d46ed3762ee263b87bbbb` |
| dbodbc16.dll    | 16.0.0.2043 x64   | `571e105fb3e14e754b16863739d402022d0e1f64a10d0b224c4e6dd429d5e8be` |

## Verificações

Comandos usam o wrapper Node do projeto; cadeia usa o runner persistente padrão
prisma com manifesto e diretórios de drivers explícitos, sem .env operacional.
Totais sobrepostos não são somados.

| Verificação                                          | Resultado                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Cadeia persistente dos três motores                  | **77/77**, **553,02 s**, sem skips                                                              |
| PostgreSQL nativo dirigido, seis arquivos            | **121/121**, **47,48 s**, sem skips                                                             |
| Consultas/anexos após ampliar recuperação OAuth      | **48/48**, **15,71 s**, sem skips                                                               |
| Unitários de anexos, onboarding, migrations e pacote | **55/55**, **5,52 s**                                                                           |
| Regressão geral MCP                                  | **1.466 aprovados, 91 não executados**, 160 arquivos aprovados/seis não executados; **87,96 s** |
| Frontend                                             | **36/36**, lint, tipos e build aprovados                                                        |
| Runtime/compiler                                     | Node **24.21.0**, TypeScript real **7.0.2**                                                     |
| Gates locais                                         | lint, tipos, build, frontend, docs:check, formatação e training:check aprovados                 |
| Release guard                                        | Exit 1 esperado: ready:false, treze gates exigidos, nenhum encerrado                            |

As não execuções da configuração geral são preservadas e não certificam
infraestrutura obrigatória. Os testes nativos cobrem leitura por dois pools,
fechamento/recomposição, isolamento de origem/vínculo, quotas concorrentes por
quantidade e bytes, acumulados expirados, dois workers, corrupção/cópia de cifra,
chave incorreta sem destruir o original, isolamento transacional incompatível,
fechamento durante lock e simulação/retomada de rotação. Fluxos HTTP/MCP testam
revogação em trânsito, operação desconhecida, fence físico, erro de auditoria e
OAuth: reinício, outro grant, Bearer manual recusado, refresh sem novo prazo e
revogação limitada à conexão.

Uma rodada intermediária não foi aceita: a fixture mudou a porta/origem no
reinício, corretamente recusada pelo armazenamento; mudança de guia durante a
rodada também tornou relatórios incompatíveis. Corrigida a fixture e repetido o
candidato estável. Não se removeu validação de origem, autorização ou atualidade.
Testes do cofre passaram a usar senha sintética por login para validar autenticação
real, sem depender de trust. Falhas de módulos temporários do sandbox foram
repetidas nativamente, sem reduzir os checks.

## Limites e limpeza

Limpeza da fixture final confirmada pelo removedor: processos, containers,
volumes exclusivos, DSN e arquivos privados removidos após conferir ownership.
A fixture
intermediária `se7e_persona_bdf7f908a91e_test` já foi removida pelo removedor que
confere nomes, raiz, labels, volumes exclusivos, DSN e processo SQL Anywhere.

Não certifica frota operacional, backup/restauração, toda extensão nativa de BLOB,
instalador desktop, imagens candidatas, acessibilidade integral ou avaliação da IA.
Persistência não recupera handles perdidos nem enumera arquivos; não restaura
permissões, apaga downloads já salvos ou renova prazo. Limpeza física de expirados
depende da próxima rodada disponível do worker; backups seguem a política do cofre.
Falha do armazenamento não aciona fallback em memória ou outra consulta.

HTTPS público e instalação/conversa ChatGPT permanecem para validação manual.
Deploy e publicação de imagens continuam bloqueados nos três projetos. Esta
rodada é evidência parcial de identidade, consulta, OAuth/console, PostgreSQL e
corte; não é aceite integral do plano.
