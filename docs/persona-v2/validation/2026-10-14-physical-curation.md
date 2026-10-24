# Curadoria de particularidades físicas — avanço parcial

Rodada de 2026-10-14, America/Cuiaba. Etapas 4 e 13 do
[plano restante](../remaining-plan.md). Deploy, imagens, commit e push não foram
realizados. Os três manifestos mantêm `ready: false`, catorze gates obrigatórios
e nenhum concluído. Esta evidência não encerra o aceite da plataforma.

## Candidato e entrega

O [inventário](2026-10-14-physical-curation-files.json) registra revisões efetivas,
hashes do recorte avaliado e cinco binários de drivers. Checkouts continuam com
alterações locais; inventário não é commit upstream nem snapshot completo.
Hub e agente não tiveram código de produto modificado neste bloco. Node 24.21.0,
TypeScript 7.0.2 real e contrato fixado do hub foram conferidos.

- Migration aditiva 0018 cria propostas físicas e previews próprios, com origem
  imutável, FKs, decisões terminais e vínculo ao perfil/publicação/identidade.
  Propostas e hashes anteriores não foram convertidos.
- Console e MCP permitem envio explícito de regras, exemplos, tabelas e
  relacionamentos. Tools fixam o perfil adotado pela skill concedida, sem
  navegação arbitrária. Consumidor exige treinamento/delegação/consentimento,
  papel no catálogo e acesso remoto atual à mesma base.
- Curador autenticado revisa conteúdo/diff por quinze minutos; hash e CAS
  vinculam proposta, rascunho, fonte/credencial, identidade e autoridade atuais.
  Incorporação de uso único altera somente o rascunho; publicação e adoção
  anteriores permanecem intactas. Rejeição por versão permite descartar conflitos.
- Substituição comum é explícita; exemplos novos permanecem candidatos. Perfis
  não podem publicar enquanto houver candidatos não revisados. Auditoria guarda
  metadados; conteúdo e justificativa permanecem no armazenamento editorial.

Contrato completo: [curadoria física](../shared-knowledge.md#curadoria-de-particularidades-físicas).

## Verificações

| Verificação                           | Resultado                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Persistência PostgreSQL v2            | 171/171, doze arquivos; cinco casos físicos repetidos após ajustes finais        |
| Cadeia persistente dos quatro motores | 30/30, sem skips                                                                 |
| Chromium                              | 20/20; jornada física repetida após ajuste final do contrato de preview e textos |
| Frontend                              | 31/31, lint, tipos e build                                                       |
| Regressão geral                       | 1.200 passaram; 91 opcionais ignorados em seis arquivos                          |

Lint, tipos do servidor com compilador 7 real, build, Node/compilador, contrato
fixado, documentação e formatação também passaram. Opcionais ignorados da suíte
geral não certificam motores, instalação externa OAuth ou avaliação da IA.

PostgreSQL/Chromium usam bancos próprios com autoridade/inspeção sintéticas para
validar aplicação e interface. Cobrem colaborador sem autoridade de revisão,
isolamento de autoria/base, revogação de papel/acesso, perfil suspenso, expiração,
conflito de item, CAS, incorporação concorrente, proveniência imutável, substituição
explícita e exemplos candidatos.

A cadeia separada usa controle MCP PostgreSQL, hub PostgreSQL/Prisma com login e
ClientAgentAccess reais de fixture, processos HTTP independentes, companion do
agente com Drift, cofre Windows DPAPI e journal. SQL e prova de identidade passam
por MCP → REST hub → Socket.IO agente → ODBC nos quatro motores. Em cada motor,
proposta MCP, consulta do próprio estado, revisão/incorporação administrativa,
negação após revogar delegação e preservação da publicação adotada foram testadas.
Não foi acrescentado DML de curadoria; conteúdo editorial nunca é executado.

Fixture final: `se7e_persona_8bb2728973b3_test`. A primeira rodada usou
`se7e_persona_cbd7ef1e7d65_test`. Ambas são dedicadas e descartáveis; nenhum
cofre, fonte, credencial ou banco operacional do usuário foi utilizado.
Limpeza e conferência dos recursos pertencentes às fixtures concluídas.
Versões de drivers são registradas no inventário; versões nativas dos motores
não foram recoletadas nesta rodada.

## Falhas tratadas e limites

A primeira rodada passou 26 casos e falhou em quatro expectativas de revisão:
o perfil já estava na revisão 2, e a incorporação corretamente produziu a 3.
O teste agora verifica a revisão exata apresentada pelo preview mais um.
Repetição em fixture nova passou os trinta casos, sem retirar cenários.
Frontend precisou de TEMP/TMP privados por falha de arquivos temporários do
ambiente Windows; a repetição passou os 31 testes sem alterações de produto.

Chromium confere a nova jornada nas larguras 360/390/768/1280 e prevenção de
incorporação antes de justificar/confirmar. Não certifica leitor de tela nem zoom
real de 200%. A audiência HTTPS do MCP em teste interno não demonstra TLS/proxy
públicos. Companion não substitui instalação desktop. Não houve instalação
privada no ChatGPT nem avaliação da IA consumidora.

Permanecem feedback, calendário explícito do curador, templates/datasets,
importação de DDL, composição de evidências paginadas, histórico/impacto ampliados,
adoção DML e homologação adversarial integral. Enforcement SQL Anywhere continua
desconhecido; treinamento não substitui prova nativa. As demais etapas do plano
e todos os gates de release permanecem pendentes.
