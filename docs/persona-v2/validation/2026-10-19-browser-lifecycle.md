# Ciclo de vida da fixture Chromium — 2026-10-19

## Correção

As rodadas anteriores terminavam o worker, mas retinham o servidor auxiliar no
Windows. O runner instalado usa encerramento de árvore de processos para
`webServer` nesse sistema; não entrega a finalização graciosa do helper.

A configuração v2 agora usa `globalSetup` com retorno de teardown no mesmo
processo do runner. Inicialização aguarda o listener; finalização fecha conexões
HTTP, runtime, provedor TLS e pools, remove somente os bancos próprios e apaga
o arquivo de estado quando pertence à rodada. Erros propagam ao runner.
Não há rota HTTP de shutdown, sinal remoto ou alteração do runtime de produção.

## Evidência

- Dois percursos dirigidos (padrão e perfil físico) passaram em 14,2 segundos,
  com término automático do processo.
- Falha deliberada em teste temporário terminou com código 1, sem intervenção.
  O teste foi removido após a verificação; não integra a suíte normal.
- Após ambas as rodadas, consulta ao PostgreSQL dedicado confirmou ausência
  dos bancos `persona_browser_<run>_test` e `persona_data_[ab]_<run>_test`.
  Arquivo `persona-v2-browser-state.json` também ausente.
- Tipos, lint e validação documental aprovados. A configuração Playwright entrou
  na lista explícita de arquivos de configuração analisados pelo ESLint.
- Rodada completa: 45 jornadas passaram e uma falhou em 4,8 minutos. O teste de
  descarte clicava na rota de origem antes da confirmação de navegação para
  treinamento. A correção espera a URL de destino antes de voltar às bases;
  não muda timeout, runtime ou regra de descarte. Três repetições dirigidas
  passaram em 9,2 segundos depois da correção. Não é uma nova rodada integral.
- A rodada com falha real também encerrou automaticamente, removendo os três
  bancos e o estado. A inspeção após a rodada final repetida confirmou a limpeza.

## Identificação e limites

Node 24.21.0, PostgreSQL 17 Alpine dedicado, hub sintético, checkout local alterado.
SHA-256:

- `persona-v2-browser-server.ts`: `691b176d7f432a63bbdc74bb4256aec5c369927c3f181f1df55c94bff76a076d`.
- `playwright.persona-v2.config.ts`: `2748a4e681965df1616cf55c250d1f303eb4935ab5c7b3d611141adb93644f6b`.

Não certifica parada de servidor instalado, queda forçada do runner, cadeia dos
três motores, HTTPS, ChatGPT ou IA consumidora. Não altera evidências históricas
das rodadas que precisaram de limpeza manual. Produção permanece bloqueada.
