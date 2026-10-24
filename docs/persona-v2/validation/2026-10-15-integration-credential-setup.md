# Setups de credenciais de integrações — 2026-10-15

Evidência local de desenvolvimento. `ready: false`; nenhum gate encerrado.

## Entrega

`iniciar_cadastro_integracao` e `iniciar_rotacao_credenciais_integracao` exigem
gerenciar_integracoes, consentimento e delegação vigentes. Responsável autentica
e confirma no navegador. Bearer, API key em header e Basic são cifrados, sem
retorno de segredo. Rotação fixa destino/tipo/versão; credencial, consumo e
auditoria fazem commit juntos. Cadastro e rotação mantêm integração/operações
inativas. Migration aditiva 0024 acrescenta identificação na auditoria e default
inativo; não altera migrations anteriores.

## Validação

- PostgreSQL: **40/40**, 14,18 s, incluindo cinco novos casos: cifra/concorrência,
  CAS/destino/isolamento, autoridade/CSRF/prazo, rollback da auditoria e
  interseção/revogação OAuth. Baseline novo e reaplicação passam na fixture.
- Chromium: **7/7**, 8,3 s. Novo cenário em 390 px cadastra API key, rotaciona
  para Basic, confere campos/versão, ausência de segredo no retorno/storage e
  replay. TLS nativo local; autoridade e resolução pública são sintéticas.
- Unitários persona-v2: **498/498**, 22,42 s; pacote privado: **25/25**, 1,75 s.
- Tipos, lint e build aprovados. Formatação dos arquivos alterados e validação
  documental verificadas. Guard de release permanece bloqueado.
- A primeira rodada detectou rótulos acessíveis dos seletores; corrigidos.
  Ajustados os testes para replay com nova navegação e nova concessão OAuth
  imutável, sem relaxar o contrato. Sandbox Windows impediu loopback e temporários
  do runner; execução local autorizada concluiu as suítes, sem skips de aceite.
- Contêiner dedicado identificado por nome/rótulo foi removido; manifesto local
  com credenciais descartado. Nenhum recurso operacional utilizado.

Node 24.21.0, TypeScript 7.0.2, PostgreSQL 17 de fixture. Não houve chamadas a
integrações, SQL de negócio, cadeia hub/agente ou alteração do contrato do hub.
HTTPS público e conexão ChatGPT continuam para validação manual. Adapters,
descoberta, publicação/execução externa, gestão completa no console, manutenção
do cofre e aceite integral permanecem pendentes.

Commit-base `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preservadas. Inventário parcial SHA-256 do conteúdo validado:

| Arquivo                                                     | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| src/domain/persona-v2/integration-credential.ts             | `491def056e0d30e60f96a81a0be036210f33dd47615113450887dccbdbab644b` |
| src/application/persona-v2/setup.ts                         | `39b2f0bc0402d44b0efe0704599686c7d42dc0047e4e0ac6878996bf34d16bc9` |
| src/infrastructure/persistence/persona-v2/security.ts       | `6b23dba98811e56eefe5dada3ac9795c42715976602501755d18131089a04758` |
| src/infrastructure/http/persona-v2-setup.ts                 | `76ae6661591404734d598d94850c64dd9e81258c39ef710770dd6f32e8dacf68` |
| migrations/persona-v2/0024_integration_credential_audit.sql | `e59a9f936847d8bd7c7a83696e1975df50452172cd1ce6540af2554b135f951b` |

[Contrato](../oauth.md#setup-de-credenciais-de-integrações),
[plano restante](../remaining-plan.md) e [aceite](../acceptance.md).
