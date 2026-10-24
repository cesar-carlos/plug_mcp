# Rotação do cofre persona-v2 — 2026-10-16

Evidência de desenvolvimento; não é release. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais preservadas.
[Inventário parcial de arquivos](2026-10-16-vault-rotation-files.json) registra
SHA-256 desta frente. `ready: false`, treze gates exigidos e nenhum concluído
permanecem inalterados. Nenhum pin, checkout ou banco do hub/agente foi alterado.

## Implementação

Comando `vault:rotate:persona-v2` de operador, default simulação, sem tool/HTTP
ou automação pelo worker. Port/caso de uso e adapter v2 próprios. Migrations
aditivas `0030_vault_rotation.sql` e `0031_vault_rotation_integrity.sql` preservam
migrations anteriores e não criam papéis globais, chaves ou logins automaticamente.

- Nove tabelas/treze campos abrangem fontes, integrações, delegações, operações
  SQL/externas, outbox, setups, OAuth e biblioteca. A fixture tem catorze células
  cifradas, por incluir operação SQL conhecida e desconhecida.
- Simulação usa transação somente leitura e autentica todas as cifras. Não
  altera chave ativa, cifra ou journal. Material ausente/corrompido, histórico de
  key ID incompatível e inventário divergente bloqueiam a operação.
- Aplicação exige papel PostgreSQL separado e confirmação do nome real do banco.
  Lock de sessão exclusivo, lotes/CAS e cursor/contagens na mesma transação.
  Exceção aos guards vincula backend/transação/relação e hashes de linha exata;
  GUC e chamada por runtime não autorizam rewrap. Triggers continuam habilitados.
- Igualdade de conteúdo é conferida em memória antes de gravar. Nova cifra tem
  nonce aleatório, versão/key ID no AAD e chave ativa. Guard preserva metadata,
  estados, IDs, fingerprints, deadlines, receipts e versões de negócio, inclusive
  em desconhecidos e registros consumidos/imutáveis.
- IDs de chave têm confirmação HMAC com contexto próprio, sem material secreto.
  Troca só de rótulo não é aceita como nova chave; IDs não podem ser rebound.
  Job concluído é permanente. Retomada exige runId, destino e keyring vinculados.
- Escritores antigos são bloqueados pelo prefixo ativo; servidor/worker conferem
  chave e keyring no startup. Ao terminar, verificação integral exige nenhuma
  cifra antiga antes de marcar completed. Configuração de outros processos e
  retirada de chaves do gerenciador de segredos não são automáticas.

[Procedimento e grants](../vault-rotation.md), [plano restante](../remaining-plan.md)
e [matriz de aceite](../acceptance.md) mantêm limites e dependências operacionais.

## Fixture e verificações

Container próprio `se7e_vault_998f3c7be54d_test`, PostgreSQL 17.11 da imagem
`postgres:17-alpine`, porta aleatória 63840 somente em loopback. Cada caso usa
banco novo aleatório `_test`. Chaves, cifras e dados são sintéticos; nenhum segredo
de operação, volume compartilhado ou fonte cadastrada pelo usuário foi utilizado.
O papel de operador e os logins mínimos existem somente nesse cluster descartável.

Node 24.21.0 e TypeScript 7.0.2 reais pelo wrapper do projeto.

| Rodada                           | Resultado                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotação inicial e baseline       | **24/24**, 34,59 s                                                                                                                          |
| Repetição com papel já existente | 25 aprovados e cinco não executados: bootstrap da fixture recusou role duplicado; tornou-se idempotente sem mudar produção                  |
| Operador de grants mínimos       | 30 aprovados e um reprovado: SELECT FOR UPDATE pedia UPDATE em binding imutável; removido lock redundante e revalidado conflito após insert |
| Rotação corrigida                | **6/6**, 12,54 s                                                                                                                            |
| Integração v2 completa           | **243/243**, 99,36 s, dezesseis arquivos                                                                                                    |
| Unitários v2                     | **512/512**, 23,60 s                                                                                                                        |
| Cofre e worker/revisão           | **16/16**, 23,73 s                                                                                                                          |
| Startup real da composição HTTP  | **6/6**, 14,84 s no arquivo do cofre, incluindo recusa de keyring antigo e início/fechamento com a chave correta                            |
| Rodada final afetada             | **6/6**, 20,38 s; inclui simulação contra bindings históricos e material novo exigido para novo ID                                          |

Rodadas se sobrepõem; não devem ser somadas. A rodada final sucede os ajustes
específicos de preflight/startup, sem tratar evidência anterior como aceite de
outros subsistemas.

Testes verificam igualdade do conteúdo, todos os campos não cifrados,
NULLs/imutabilidade preservados, CAS inválido e coluna fora do escopo recusados,
job sem escrita na simulação, papel sem elevação por GUC, permissões mínimas sem
poder administrar tokens/estados, chave antiga ausente, GCM corrompido, ID/material
incompatível, inventário novo, lock concorrente e tombstone do job concluído.
O caso de retomada mata a própria conexão PostgreSQL dentro do lote: rollback
mantém cifras/versões, a autorização interna desaparece e novo processo/rodada
retoma do cursor confirmado. CLI também pausa e retoma em processos independentes,
com stdout limitado a contagens, modo, estado, runId e key ID.

Tipos, lint de src/tests e do CLI, build servidor, formatação e docs:check
aprovados. Falhas iniciais de lint foram corrigidas sem relaxar regras.
O guard de release continua recusando liberação. Não houve deploy, publicação,
commit, branch ou push nesta frente.

## Limites e limpeza

São testes nativos do controle MCP em PostgreSQL, cofre AES-GCM e processos locais.
Não homologam cadeia de negócio nos três motores, TLS público, ChatGPT real,
backup/restauração, atualização coordenada de todas as instâncias, outbox externa,
avaliação da IA ou produção. O banco valida papel/escopo/CAS; o operador confiável
valida a equivalência criptográfica. A simulação não reserva uma futura aplicação.

Conexões, logins de caso e bancos foram encerrados; container e volumes anônimos
próprios foram removidos após conferir a etiqueta de propriedade. Nenhum recurso
operacional ou compartilhado foi removido. HTTPS e ChatGPT continuam manuais;
produção permanece bloqueada e todos os gates seguem pendentes de aceite integral.
