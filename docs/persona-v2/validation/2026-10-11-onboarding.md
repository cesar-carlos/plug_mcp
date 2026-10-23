# Onboarding e consultas no console

> Relatório histórico extraído do registro consolidado em 2026-10-11.
> Data registrada: 2026-10-11 (registro). Datas, contagens e limitações não foram reavaliadas
> nesta reorganização. [Índice](../validation.md) · [Estado atual](../README.md).

## Rodada histórica de onboarding: criar persona, conectar bases, treinar e consultar

Console inicial `/app` ligado à entrada de desenvolvimento v2. Cadastro usa
AGENT_ID, CLIENT_TOKEN, CLIENT_EMAIL, CLIENT_PASSWORD e DIALETO; nome físico vem
da policy vigente, com recusa quando ausente. Não há descoberta comprovada do
dialeto/instância nessa inferência. Contexto preserva significados de tabelas e
relacionamentos; busca lexical e resource de fonte filtram concessões. SELECT
v2 aceita schema exato com alias, recortes e policy sem equivalência pelo nome final.
Base comum `persona-v2-source-onboarding-1`; nova publicação exige preview/relatório
vigentes. Não houve alteração de schema/migrations nesta rodada.

Verificações executadas, sem usar fontes cadastradas:

- `release:check` completo: Node **24.21.0**, TypeScript **7.0.2**, contrato/base,
  lint, formatação, tipos e builds aprovados. **1.087 testes de backend passaram**;
  preservados os **91 skips legados**. Frontend: **23 testes passaram**.
- PostgreSQL v2: **66 testes**, quatro arquivos, sem skips. Incluem banco inferido,
  fontes independentes, schema exato, contexto autorizado e GET do navegador sem
  dispensar Host/sessão/CSRF ou Origin nas mutações.
- Chromium: **3 testes passaram**, sem skips. Persona vazia, duas bases reais com
  valores distintos, publicação confirmada, preview invalidado por edição, token
  explícito, validação vazia, consultas/adaptação, escrita recusada sem fingir
  ausência, limpeza de resultados, edição pendente e teclado/tela móvel.
- Inspeção visual do console móvel, sem credenciais/resultados na captura.
  Acrescentada a suíte de onboarding ao CI Linux com URL de teste explícita.

Persistência e SELECT do navegador usam três bancos PostgreSQL dedicados aleatórios;
hub/autenticação são sintéticos. Isso não avalia a IA nem homologa a cadeia real
hub/agente ou os quatro motores. O contêiner próprio de teste foi removido;
instâncias existentes foram preservadas. Os três bloqueios de release foram
executados e recusaram publicação como esperado, com `ready:false` e nenhum gate
integral liberado.

Entrada principal ainda legada. Faltam discovery físico/dialeto, curadoria/grafo
completos, OAuth, administração/delegação e demais jornadas do console, integrações,
retenção/cache e homologação/corte integrais. Detalhes do [fluxo inicial](../onboarding.md)
e [pendências de aceite](../README.md#pendências-para-aceite-integral).
