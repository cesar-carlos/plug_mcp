# Distribuição candidata local — 2026-10-19

## Escopo e ambiente

Commit-base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais
preservadas. O inventário de 1.038 arquivos desta rodada resulta em
`f4b9244f58892ac779893d5c2fd7c2394359fe12e343eb032d1cf345436a3349`.
[Hashes dos arquivos afetados](2026-10-19-candidate-distribution-files.json).
HEAD sozinho não identifica o candidato e esses hashes não constituem aceite.

Docker Desktop 29.7.2, Linux amd64, Node 24.21.0 e TypeScript 7.0.2 real no build.
Imagem construída pelo alvo `persona-v2-candidate`, sem publicar. PostgreSQL 16
Alpine e Redis 7 Alpine em projeto aleatório exclusivo, sem portas dos bancos
expostas. Segredos novos em arquivo temporário; hub propositalmente indisponível
em domínio `.invalid`. Não houve autenticação remota ou SQL em bases de negócio.

Imagem candidata local:
`sha256:e0f5a9118e8f73bfc1de3dd2dcc29a5089efa471ecc5ff8f76c8782febd9f2c3`.
Entrypoint observado: `./docker-entrypoint-persona-v2.sh`.

Alvo legado reconstruído somente para compatibilidade:
`sha256:815de0af7308679e09b5cc4677d2b64e81e5fbfe3d0f063fe0a3d2733745611c`.
Entrypoint observado: `./docker-entrypoint.sh`. Não foi iniciado ou publicado.
Esses identificadores locais não são aceite de uma imagem em registry.

## Resultados

`scripts/homologation/test-persona-candidate.ps1` concluiu a matriz ampliada:

- Produção recusada nos modos server, worker e migrate, com motivo esperado.
- Chave ausente e comando desconhecido recusados.
- Servidor recusado em banco vazio, conservando zero tabelas públicas.
- Migração recusada em fixture legada com tabela `acesso`; tabela e registro
  sintético preservados, sem criar ledger v2.
- Quarenta migrations aplicadas e reaplicadas sem duplicação.
- Servidor saudável, geração v2 e `complete: false`.
- Console, favicon, Apple Touch Icon, manifesto e símbolo PNG disponíveis.
- Servidor/worker parados e reiniciados, conservando migrations.
- Quatro jobs do worker registraram conclusão: revisão, temporários, retenção e outbox.
- A rodada final exigiu ao menos dois ciclos completos de cada job, comprovando
  execução antes e depois da parada/reinício, não somente presença de logs antigos.
- Checksum adulterado apenas na fixture impediu inicialização de servidor/worker.

Builds de servidor e frontend passaram na imagem. Sintaxe PowerShell e shell
conferida; documentação e formatação verificadas. O comando de liberação recusou
o manifesto atual, como esperado. Não se encerrou nenhum gate.

## Falhas corrigidas e limpeza

Duas tentativas iniciais falharam na interpolação: remover variáveis por chamada
.NET preservava valores vazios que sobrepunham o arquivo da fixture. A rotina
agora remove as variáveis do ambiente do processo e restaura o estado original.
Não foram criados containers nessas tentativas; ambas as pastas de segredos
foram removidas após conferir caminhos e ausência de recursos associados.

Rodadas bem-sucedidas removeram containers, volumes e redes de seus projetos
aleatórios. Conferência final não encontrou recursos ou pastas da fixture.
Imagens locais permanecem para inspeção; recursos preexistentes foram preservados.

## Limites

Não é validação de login, treinamento, consultas, três motores, plugin, proxy/TLS,
ARM64 ou instalação desktop do agente. Nenhum contrato público do hub foi alterado.
O reset de desenvolvimento, aceite do digest, supervisão, backups/restauração e
corte coordenado continuam no plano. HTTPS/ChatGPT seguem manuais.

O alvo padrão continua legado; candidato usa modo de desenvolvimento e recusa
produção. Manifesto permanece `ready: false`. Não houve commit, push ou deploy.
