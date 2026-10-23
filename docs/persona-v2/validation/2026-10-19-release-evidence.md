# Verificação de evidências de liberação — 2026-10-19

## Escopo

Fortalecimento do bloqueio de publicação, sem liberação, imagem publicada ou
mudança nos contratos públicos do hub/agente. O verificador agora exige treze
relatórios vinculados ao candidato, hashes dos artefatos e registro de aceite.
Captura local inclui arquivos novos e modificados, sem escrever no index.

Testes positivos usam exclusivamente repositórios Git temporários e registros
sintéticos identificados. Não há relatório de gate aceito criado no projeto.
Fixtures removidas ao finalizar cada teste; nenhum banco ou serviço operacional
foi acessado. O trabalho local preexistente foi preservado.

## Verificações

- 21 testes aprovados em três arquivos, sem skip: contrato dos gates, evidências
  e seleção de caminhos para publicação.
- Cobertura negativa: bytes alterados de código/relatório/artefato/aceite,
  omissões, skip, aprovação ausente, ordem temporal, revisão de outro candidato,
  verificações vazias/duplicadas, travessia e junction/symlink.
- Cobertura positiva: candidato íntegro, commit posterior apenas de provas,
  captura sem alteração do checkout e revisão explícita de `workflow_run`.
- Node 24.21.0, TypeScript 7.0.2, tipos, lint dos testes alterados e build passaram.
- `docs:check` passou. Formatação dos arquivos tocados validada; `.mdc` utiliza
  explicitamente o parser Markdown.
- `persona:release-check` retornou código 1, como exigido para o manifesto atual.
  Captura `--candidate` retornou `authorizesRelease: false`.

## Limites

Commit-base MCP: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`. O inventário
local de 1.034 arquivos produziu
`fa49f513bf9159eed3fb26498f3665e3adeb776660b6c24f31137928c404fb8e`.
Arquivos diretamente afetados estão no
[inventário desta rodada](2026-10-19-release-evidence-files.json).
Esses hashes identificam esta conferência; não constituem aceite do candidato.

É validação local de integridade, sem execução do GitHub Actions, imagem, banco,
UI, avaliação da IA ou cadeia dos três motores. Um nome de revisor e um arquivo
não autenticam uma pessoa: o aceite e sua revisão autorizada permanecem externos
ao verificador. Hub/agente são identificados pelos relatórios, sem validação
automática dos seus checkouts neste comando.

Ainda faltam vínculo ao digest da imagem, dependência de todos os jobs na
publicação, distribuição candidata e os demais itens do plano. HTTPS/ChatGPT
seguem manuais. `ready: false` e zero gates concluídos permanecem intactos.
Não houve branch, commit do projeto, push, publicação ou deploy.
