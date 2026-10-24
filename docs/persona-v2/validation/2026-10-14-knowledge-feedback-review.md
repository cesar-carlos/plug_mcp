# Feedback e calendário do conhecimento — avanço parcial

Rodada de 2026-10-14, America/Cuiaba, etapas 4/13 do
[plano restante](../remaining-plan.md). Deploy, publicação de imagens, branch,
commit e push não foram realizados. Os três manifestos conservam `ready: false`,
catorze gates obrigatórios e nenhum concluído.

## Candidato e entrega

O [inventário](2026-10-14-knowledge-feedback-review-files.json) identifica revisões
efetivas, hashes do recorte e cinco drivers. Checkouts contêm alterações locais;
isso não representa commit upstream nem snapshot completo. Hub/agente não tiveram
código de produto modificado neste bloco. Migration nova 0019 é aditiva; não
reescreve publicações, hashes ou propostas anteriores.

- Feedback explícito de erro/correção/lacuna vincula item autorizado, publicação
  exata, token/concessão e origem. Consumidor comum pode relatar; não pode alterar
  treinamento por esse caminho. Conteúdo editorial não é copiado para auditoria.
- Responsável trata a fila com CAS, encerrando ou vinculando proposta existente
  de mesma origem e autoria. Encaminhamento não cria/incorpora ou publica conteúdo.
- Calendário separado por publicação tem prazo futuro escolhido pelo curador,
  justificativa, CAS e histórico imutável. Sem configuração, não inventa data.
  Vencimento produz aviso/tarefa sob demanda, sem suspensão/republicação.
- Console protege edição, mostra nomes publicados, permite feedback a partir da
  busca e calendários de padrão, perfil e skill. MCP entrega somente estado do
  próprio feedback e avisos das origens expostas, sem justificativas do catálogo.

[Contrato e alcance](../shared-knowledge.md#feedback-e-revisão-temporal).

## Validação

| Verificação                           | Resultado                                                       |
| ------------------------------------- | --------------------------------------------------------------- |
| Persistência PostgreSQL v2            | 176/176, doze arquivos                                          |
| Cadeia persistente dos quatro motores | 30/30, sem skips                                                |
| Chromium                              | 20/20; mais dois percursos afetados de calendário padrão/perfil |
| Frontend                              | 31/31, lint, tipos e build                                      |
| Regressão geral                       | 1.200 passaram; 91 opcionais ignorados em seis arquivos         |

Node 24.21.0, TypeScript 7.0.2 real, lint, tipos/build do servidor, contrato
fixado, documentação e formatação foram conferidos. Os opcionais da suíte geral
não certificam motores, instalação OAuth externa ou avaliação da IA.

Persistência/Chromium usam bancos próprios e autoridade/inspeção sintéticas.
Casos novos cobrem referência oculta/obsoleta, outro consumidor/persona,
revogação, payload imutável, decisões concorrentes, prazo ausente/passado,
revisão inicial indevida, histórico e CAS, colaborador sem poder de revisão,
acesso remoto revogado e vencimento sem alteração do snapshot. Console cobre
feedback pendente ao navegar, envio/tratamento, calendário e proteção de edição
ao trocar base. Larguras 360/390/768/1280 são verificadas na jornada principal.

A cadeia separada usa PostgreSQL MCP, hub PostgreSQL/Prisma, login e
ClientAgentAccess reais de fixture, processos independentes e companion com
Drift, cofre Windows DPAPI e journal. SQL/prova passam por MCP → REST hub →
Socket.IO agente → ODBC. Nos quatro motores, feedback sobre perfil adotado,
encaminhamento à proposta de mesma origem, calendário com prova da mesma base,
avisos concedidos e revogação foram exercitados, preservando consulta/DML e demais
regressões. Conteúdo editorial não é executado como SQL.

Fixture final: `se7e_persona_0288f259dc2b_test`; primeira rodada:
`se7e_persona_3c52842207d9_test`. Nenhuma fonte ou credencial operacional foi
utilizada. Limpeza remove somente recursos pertencentes a essas fixtures, após
conferência de propriedade/caminhos. Drivers são fixados no inventário; versões
nativas dos motores não foram recoletadas.

## Falhas tratadas e limites

A primeira cadeia passou 26 casos e falhou em quatro expectativas após revogar
token: o servidor corretamente devolveu HTTP 401, mas o helper esperava HTTP 200
antes de conferir a negação. Helper agora reconhece autenticação recusada e uma
fixture nova passou os trinta casos. Expectativas de prazo inválido também foram
ajustadas ao HTTP 409 do contrato v2 existente, sem afrouxar validação.

Calendário é configurado explicitamente em versões publicadas. Integração da
exigência de data no fluxo de publicação, worker/notificações proativas, tarefas
distribuídas e retenção continuam pendentes. Feedback privado não cria proposta
compartilhada automaticamente. Encaminhamento no console usa ID de proposta
existente; não é um editor alternativo de proposta.

Companion não certifica instalação desktop. Audiência HTTPS em teste interno não
prova TLS/proxy públicos. Chromium não certifica leitor de tela ou zoom real de
200%. Plugin no ChatGPT e IA consumidora não foram avaliados. Templates/datasets,
DDL importado, compatibilidade ampliada, adoção DML e demais gates continuam
pendentes; enforcement SQL Anywhere permanece desconhecido.
