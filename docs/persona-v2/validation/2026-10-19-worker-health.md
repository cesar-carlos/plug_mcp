# Saúde e parada do worker empacotado — 2026-10-19

## Candidato e escopo

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Imagem local `se7e-persona-v2-candidate:worker-health-local`, linux/amd64,
ID Docker `sha256:41d87c74e20bed9b376526884d8668d732081f279c7ed4d2beea681f6d5bb309`.
A label de revisão informa a base, não um commit contendo o checkout alterado.
Sem publicação, push, alteração no contrato do hub ou aceite de produção.

## Evidência

- Node 24.21.0, TypeScript 7.0.2, tipos e build backend aprovados.
- 33 testes dirigidos aprovados: loop/probe HTTP, configuração de produção e
  distribuição de artefato. Lint dos arquivos TypeScript afetados aprovado.
- Probe real em loopback: 503 antes do ciclo, 200 após sucesso, falha sem conteúdo
  privado, métodos/rotas recusados e parada não saudável. Relógio controlado
  comprova atraso, recuperação e ausência de execução provocada pelo probe.
- Docker build da candidata aprovado, incluindo backend e frontend. Avisos
  não fatais das annotations de Zod permanecem.
- `test-persona-candidate.ps1 -Image se7e-persona-v2-candidate:worker-health-local`
  aprovado com PostgreSQL/Redis próprios: quarenta migrations, reaplicação,
  recusas de produção/segredo/comando/legado/checksum, startup sem DDL e assets.
- `compose up --wait` aguardou servidor e worker saudáveis. Probe do worker
  retornou `healthy` antes e depois do reinício; quatro jobs completaram ambos
  os ciclos. As duas paradas comprovaram exit code zero, sem OOM e sem processo
  em execução. Fixtures e volumes foram removidos pelo projeto aleatório próprio.

O primeiro lint exigiu tipo explícito de retorno e substituição de callbacks
vazios nos testes; foram corrigidos sem supressões. Nenhuma falha funcional
persistiu na rodada dirigida.

## Limites

Prova local não certifica supervisor instalado, carga, jobs longos, perda de
conexão ou rollback de efeitos. Saúde não atesta propriedade de lease, entrega
de outbox ou conclusão dos gates. O harness não executou SQL de negócio pela
cadeia nesta rodada. Imagem não foi promovida; produção segue recusada e
`ready: false`. HTTPS e ChatGPT continuam manuais.
