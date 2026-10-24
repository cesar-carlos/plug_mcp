# Runner externo e casos/relatórios — 2026-10-15

Evidência local de desenvolvimento; `ready: false`, nenhum gate encerrado.
[Contrato](../external-integrations.md#runner-cli-e-casos-no-console).

## Entrega e ambiente

CLI de operador com manifesto fechado, versões/hashes exatos, credencial de
fixture cifrada no cofre, identificação autenticada, claim durável e limpeza
confirmada. Migração aditiva 0027 mantém journal de rodadas, vínculo aos relatórios
e histórico editorial imutável de casos editados/removidos. Migrations aplicadas
anteriores não foram alteradas. Console possui casos tipados, CAS, proteção da
edição e relatórios paginados/obsoletos; não expõe execução ou aprovação técnica.

Node 24.21.0, TypeScript real 7.0.2, PostgreSQL 17.11 em contêiner próprio.
Provedores REST/MCP usam TLS nativo de fixture, sessão JSON/SSE e ledger sintético
em diretórios próprios. Credenciais são exclusivamente sintéticas. Nenhuma fonte
ou integração operacional foi acessada.

O caminho de sucesso exercita `executeExternalManifest` (a mesma entrada funcional
usada pelo CLI), cofre/journal/PostgreSQL reais e adapters nativos. Resolver/CA são
injetados somente nos testes para apontar nomes públicos virtuais ao TLS local.
O subprocesso CLI verifica recusa segura sem manifesto; não foi homologado um
subprocesso de sucesso contra DNS/HTTPS público. CLI real não tem opção de bypass
de DNS/TLS/porta. Autoridade Client do console é sintética; não há SQL de negócio
nesses testes de integrações. Instalação pública/ChatGPT continuam manuais.

Inventário selecionado do checkout em
[external-runner-candidate.json](external-runner-candidate.json); não representa
commit novo nem snapshot completo da plataforma.

## Rodadas

- Primeira rodada PostgreSQL: 51 aprovados, duas falhas de preparação. Fixtures
  REST/MCP compartilhavam a origem bloqueada pela rodada anterior incerta; a
  chamada administrativa de teste omitia CSRF. Corrigidos nomes de origem por
  fixture e requisição, preservando bloqueio global e CSRF. Repetição: 53/53.
- Rodada final PostgreSQL: **54/54**, 34,10 s. Baseline novo e reaplicação;
  CLI REST/MCP aprovado somente após limpeza, replay recusado, cases/hash obsoletos
  recusados, limpeza perdida mantém desconhecido e bloqueia outra rodada na origem.
  Ownership recusado impede casos e POST de cleanup. CAS concorrente, tipos, CSRF,
  ausência de endpoint de execução/aprovação, acesso de outro responsável,
  paginação sem duplicação e histórico imutável de caso removido também cobertos.
- Regressão final persona-v2 e pacote privado: **537/537**, 50 arquivos, 26,48 s.
  Inclui recusa do CLI sem manifesto e impedimento de envio tardio após timeout.
- Console: lint, tipos, **34/34** testes e build. Chromium **2/2**, 12,5 s:
  nova jornada em 390 px cria/remove caso, protege navegação/edição e mostra relatório
  obsoleto, sem criar rodada/ação; jornada anterior de aprovação continua funcional.
  Não constitui avaliação de leitor de tela, zoom real ou todas as larguras.
- Tipos, build, lint e formatação dos arquivos alterados passaram. `docs:check`
  conferiu 121 arquivos, 795 links e 13 gates, sem problemas. Node/compilador
  passaram; guard de release recusou publicação conforme esperado.
  Avisos de annotations de terceiros no build
  do frontend não impediram a geração.

## Gate independente do hub

`training:check` **recusou** o candidato porque HEAD do hub avançou de seu pin
`693da92a334c98ae911c329d52006456ce768b09` para
`eb80cfbdf106d2b238f8299940b472f278b9d13e`. Revisão local do diff encontrou nove
arquivos de benchmark/tests/CI e nenhuma mudança em `src`, `schemas` ou `contracts`.
Essa equivalência observada não equivale ao aceite do CI/benchmark: a rodada do
hub ainda reprovou um limite REST. Pin e snapshot MCP permaneceram intactos,
sem fallback, re-pin automático ou relaxamento de gate. Revisão coordenada e nova
evidência do hub são pendências independentes da implementação deste runner.

## Limites e limpeza

HTTPS público e ChatGPT são validação manual. Restam editor/importação/descoberta
de contratos, operação/retenção dos journals e aceite integral. Rodada incerta ou
interrompida permanece bloqueada até investigação; não há reset/reexecução automática.
Relatório técnico não aprova semântica, publica ou amplia concessões.

Contêiner e manifesto da fixture própria foram removidos, conferindo nome/rótulo.
Zero diretórios de ledger/runner dessa família permaneceram no temporário.
Nenhum deploy autorizado.
