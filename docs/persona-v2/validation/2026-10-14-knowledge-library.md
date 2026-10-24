# Biblioteca editorial e DDL estrutural — avanço parcial

Rodada de 2026-10-14, America/Cuiaba, etapas 4/13 do
[plano restante](../remaining-plan.md). Não houve branch, commit, push, deploy ou
publicação de imagem por esta tarefa. `ready: false` permanece obrigatório.

## Entrega

[Contrato](../knowledge-library.md): biblioteca autorizada por catálogo, templates
e datasets cifrados, versões imutáveis/CAS, origem dos rascunhos e migration
aditiva 0021. Preserva migrations aplicadas, snapshots e calendários anteriores.
Responsável escolhe fonte e variante; rascunho de consulta tem exemplo candidato,
sem publicação, casos, relatórios ou concessões herdadas. Dataset fixa proveniência,
template/versão/hash, limites e tipos; decimais permanecem texto. Não captura
material operacional. Leitor/MCP comum não recebe a biblioteca editorial.

DDL tem gramática fechada sem executor/conexão. Retorna inferido/unknown,
conserva chaves compostas e não inventa grão sem PK declarada. Trecho fora da
gramática recusa integralmente o arquivo. Console modifica apenas novo rascunho
em edição; adoção continua exigindo inspeção pelo hub/agente. Base/instruções v2
descrevem os limites; versão técnica `persona-v2-knowledge-library-1`, sem mudar legado.

## Verificações locais

| Verificação                | Resultado                                                            |
| -------------------------- | -------------------------------------------------------------------- |
| Persistência PostgreSQL v2 | 184/184 em doze arquivos, com base técnica atualizada                |
| Chromium                   | 21/21, incluindo biblioteca/dataset/DDL, descarte e erro JSON seguro |
| Frontend                   | 31/31, lint, tipos e build                                           |
| Regressão geral            | 1.222 passaram; 91 opcionais ignorados em seis arquivos              |
| Gramática/datasets         | 22 casos na regressão geral; quatro dialetos e recusas adversariais  |

Lint, tipos/build com TypeScript 7 real, Node 24.21.0, documentação e formatação
foram conferidos. Casos afetados de documentação/persona foram repetidos após
atualizar instruções. Opcionais não certificam motores ou serviços externos.
Repetição afetada: 326/326 em trinta arquivos. Uma tentativa anterior falhou ao
abrir o cache SSR temporário da sandbox; usar TEMP/TMP privados estáveis resolveu,
sem alterar os casos ou os requisitos.

PostgreSQL/Chromium usam bancos dedicados e autoridade sintética. Cobrem cifragem,
imutabilidade, CAS/histórico, catálogo/role revogados, referência cruzada, origem,
decimal exato, fonte/dialeto explícitos, candidatos impedidos de publicar e DDL
sem criar tabelas. Console cobre template até rascunho, dataset explícito, arquivo
DDL, descarte e larguras 360/390/768/1280. Não certifica leitor de tela, zoom real
de 200%, instalação privada ou IA consumidora.

## Cadeia real: evidência parcial e bloqueio

Fixtures próprias usam PostgreSQL MCP, hub PostgreSQL/Prisma, autenticação e
ClientAgentAccess reais, companion com Drift/cofre DPAPI, Socket.IO, ODBC e journal.
Nenhuma fonte, DSN ou credencial operacional foi usada.

1. `se7e_persona_dc540d03e820_test`: 26 passaram, quatro falharam no helper, que
   lia a versão no wrapper em vez de `source.authorizationVersion`. Corrigido
   sem afrouxar validação.
2. `se7e_persona_6c4563b9a276_test`: 16 passaram, 14 falharam posteriormente em
   operações/recuperação. Os quatro percursos novos de biblioteca passaram:
   template, dataset, rascunho candidato, recusa inicial de publicação, revisão
   humana explícita, publicação/token e SELECT real pelo hub/agente. A suíte
   completa não passou.
3. `se7e_persona_6d0a90bab83e_test`: nove passaram, 21 falharam. Perdeu a capability
   de identidade executora e processos ficaram indisponíveis. Houve
   `CAPABILITY_UNAVAILABLE`, `ECONNREFUSED` e saída não zero, sem fallback ou
   relaxamento da prova. São falhas, não skips.

Revisões do hub/agente mudaram fora desta tarefa: hub observado passou do
commit-base `0d2c6b4` para `bfb40be`; agente chegou a `50663b57`, com alterações
locais. Não se atribui automaticamente toda falha a isso; a causa completa da
perda de capabilities ainda exige revisão.

`training:check` confirmou divergência do hub atual frente ao commit-base/snapshot
revisados. Pin, snapshot e contratos não foram atualizados automaticamente.
O runner agora verifica esse contrato **antes** de iniciar processos/migrations.
Recusa inicial foi testada, sem nova sessão de fixture. Essa checagem não congela
o checkout contra alterações posteriores.

**Homologação integral bloqueada:** revisar contratos/revisões efetivos, resolver
capabilities e repetir os trinta casos em fixture nova. Percursos parciais não
aprovam os quatro motores ou o candidato integral. Nenhum dos 14 gates é encerrado.

## Candidato, limpeza e limites

[Inventário](2026-10-14-knowledge-library-files.json): hashes do recorte, revisões
observadas e cinco drivers. Não é commit upstream ou snapshot executável completo.
Mudanças posteriores invalidam equivalência. Código de produto do hub/agente não
foi modificado por esta tarefa. Versões nativas dos motores não foram recoletadas.
As três fixtures foram removidas após conferir caminhos, processos, labels,
volumes e DSN pertencentes a elas; armazenamentos operacionais foram preservados.

Consumo delegado da biblioteca, runners genéricos, templates dos outros tipos
de skill, compatibilidade ampliada, adoção DML, integrações, retenção, outbox,
distribuição e demais gates continuam pendentes. Datasets desta entrega não
aceitam campos pessoais/sensíveis. Nenhuma estrutura comercial Data7 é inventada.
Deploy permanece bloqueado.
