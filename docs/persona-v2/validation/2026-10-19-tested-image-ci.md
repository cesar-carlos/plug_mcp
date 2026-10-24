# Ordem de publicação e imagem testada — 2026-10-19

## Escopo

Publicação sai da matriz amd64/arm64 e aguarda documentation, verify, windows e
native-musl. Artefato amd64 é exportado depois dos testes, conservado sete dias
e conferido antes da publicação. Deploy busca a mesma rodada por workflow_run.id,
verifica bytes/identidade/revisão e não faz pull ou rebuild. Manifesto bloqueado
continua obrigatório. Alvo padrão permanece legado.

## Evidências locais

- Doze testes dirigidos aprovados: integridade, revisão/plataforma/runtime
  divergentes, arquivo alterado/ausente, dependências de todos os jobs e origem
  exata do artefato de deploy.
- Typecheck e lint do teste aprovados após corrigir uso de API fora do alvo ES2022.
- Regressão ampliada: 31 testes aprovados em quatro arquivos, incluindo o
  verificador de release e as evidências. Build, docs:check, Node 24.21.0 e
  TypeScript 7.0.2 aprovados. Não corresponde à suíte integral da plataforma.
- Actionlint 1.7.9 aprovado para os dois workflows, com rede desabilitada e
  repositório montado somente para leitura; shellcheck/pyflakes desabilitados.
- Docker local: imagem scratch descartável com revisão sintética, exportação,
  registro, verificação, remoção, recarga e verificação do ID aprovados.
  Tag/imagem e pasta temporária próprias removidas no encerramento.

Arquivos funcionais da rodada estão identificados no
[inventário SHA-256](2026-10-19-tested-image-ci-files.json).

## Limitações

Não foi executado CI remoto, push de imagem, SSH ou deploy. A fixture mínima
comprova transporte local do artefato, não funcionamento do produto ou portabilidade
entre todos os backends Docker. Falha de identidade bloqueia, sem fallback.
Associação do digest aos relatórios aceitos dos gates e corte continuam pendentes.
Nenhum gate encerrado; ready:false. HTTPS e ChatGPT permanecem manuais.
