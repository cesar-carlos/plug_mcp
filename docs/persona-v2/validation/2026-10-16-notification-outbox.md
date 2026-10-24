# Outbox e notificações externas — 2026-10-16

Evidência parcial de desenvolvimento. Base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, alterações locais preservadas.
[Inventário parcial SHA-256](2026-10-16-notification-outbox-files.json) identifica
esta frente, sem representar commit/release. Treze gates continuam pendentes e
`ready: false` não foi alterado. Nenhum projeto, banco ou cofre operacional do
hub/agente/ERP foi modificado.

## Entrega

[Contrato](../outbox.md): configuração explícita do responsável Client no console,
CSRF/Host/Origin, CAS, identidade revalidada fora da transação, destino/segredo
cifrados e eventos privados selecionados. Produtores transacionais de revisão
privada e estados SQL/externos, só IDs/prazos/estados. Não exporta catálogo ou
payloads/receipts. Suspensão desativa assinatura, sem reativação automática.

Quarto job v2: HMAC-SHA256 sobre ID/timestamp/corpo, TLS nativo com DNS público/IP
fixado, sem redirects, resposta limitada e sem credenciais de outra origem.
Claims por linha, fencing/lease, dez tentativas/24 horas, backoff/jitter,
dead-letter e retomada sem repetir operação de negócio. Confirmar aviso não
aprova operação. O destinatário deve deduplicar o ID, pois confirmação perdida
pode repetir a mesma mensagem.

Migrations aditivas 0032–0035, sem alterar as anteriores: endpoint/guards,
serialização com manutenção do cofre, namespaces de IDs SQL/externos e referência
à versão de credencial. Novas filas não copiam cifras antigas durante rotação
parcial; o registro de um estado/receipt não depende do cursor do cofre.
Inventário de rotação ampliado para quinze campos/dez tabelas. Histórico da fila
anterior não se torna dispatchable nem é importado para notificações.

## Ambiente e verificações

Fixture própria `se7e_outbox_56f963e831c4_test`, label de propriedade igual ao nome,
PostgreSQL 17.11 / `postgres:17-alpine`, imagem
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
Porta 53467 apenas loopback; bancos aleatórios terminados `_test`. Provedores TLS
nativos usam CA/hostname/resolver sintéticos e ledger em diretório temporário
próprio. Segredos/dados são sintéticos. Não houve envio a destinatário real.

Node 24.21.0 e TypeScript 7.0.2 reais pelo wrapper do projeto.

| Rodada                                               | Resultado                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Outbox/cofre após primeiros ajustes                  | 13/13, 25,99 s; sete casos de outbox e seis de cofre                   |
| Outbox com transições e orçamento                    | 9/9, 19,35 s                                                           |
| Integração v2 antes de namespaces/referências finais | 252/252, 138,33 s                                                      |
| Integração v2 com namespace e revogação concorrente  | 253/253, 114,21 s, dezessete arquivos                                  |
| Rodada final afetada após referência de credencial   | 36/36, 50,74 s: onze outbox, seis cofre e dezenove baseline/migrations |
| Unitários v2                                         | 512/512, 26,59 s                                                       |
| Frontend                                             | 36/36, 729 ms; lint e tipos aprovados                                  |
| Chromium do novo painel                              | 1/1, 9,3 s, 390px                                                      |
| Chromium completo corrigido                          | 27/27, 2,3 min                                                         |

Rodadas se sobrepõem; não somar. A rodada afetada sucede as mudanças finais do
produtor/claim e comprova interação com rotação parcial; relatórios anteriores
não certificam automaticamente o novo candidato integral.

Casos comprovam rollback atômico, assinatura sem Authorization, dois workers,
claim abandonado e ACK antigo recusado, perda de resposta, orçamento sem reset,
revogação depois do DNS, responsável revogado durante configuração, outra conta,
CSRF/CAS, HTTPS privado/misto/redirect/limite de resposta, estados obsoletos,
prazo vencido, tombstones e filas antigas não promovidas. O mesmo UUID nos
journals SQL/externo conserva ambos os eventos. Corpo UTC permanece igual após
retomada com timezone de conexão diferente.

Um teste mata processo filho real depois do ledger do receptor aceitar o evento
e antes do ACK local. O lease é expirado explicitamente na fixture; outro processo
entrega o mesmo ID/corpo, com duas cópias no ledger e nenhuma execução de negócio.
Outro pausa a rotação real do cofre, registra transição/aviso sem copiar cifra
antiga, retoma o cofre e entrega usando o segredo preservado.

Falhas encontradas e corrigidas: versão anterior zero na auditoria inicial;
cast de UUID da fixture; hostname TLS da fixture; namespace de IDs; e interação
entre nova chave ativa e cópia de credenciais. Primeira regressão Chromium teve
26 aprovados/um falho por seletor global de status ambíguo; aprovação funcionava,
seletor passou a usar a região da operação. Não se retirou acessibilidade.
Rodadas unitárias no sandbox perderam temporários SSR antes de importar suítes;
repetição com temporários Windows normais aprovou, sem relaxar testes/regras.

Tipos, lint, build servidor/frontend, formatação e documentação foram conferidos.
`training:check` **continua bloqueado**: pin MCP
`e8f56db8e0205b94b99b5ac7dabd41655f4fd2c0`, checkout hub lido em
`76950497dc386130e13b7d6afc0678e50208e985`; contrato mantém hash
`a8e8bc82a9b6d995c8637bf47bc35e17d44c5b21aba60889be25654ac60f4e60`.
Não houve revisão/re-pin nesta frente. Guard de release continua recusando
publicação; não houve branch, commit, push, imagem publicada ou deploy.

## Limites e limpeza

Não certifica receptor público, fleet instalada, cadeia de negócio nos três
motores, avaliação da IA, backup/restauração, Redis distribuído ou produção.
HTTPS público e ChatGPT permanecem para validação manual. Retenção futura de
metadados da fila e homologação operacional ampliada continuam no plano.

Bancos/processos/provedores de fixture foram encerrados. Container e volume
anônimo próprios removidos após conferir a etiqueta; nenhum recurso compartilhado
foi removido. Nenhum gate foi encerrado.
