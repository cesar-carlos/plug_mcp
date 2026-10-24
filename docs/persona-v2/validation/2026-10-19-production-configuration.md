# Preparação de configuração de produção — 2026-10-19

## Alteração

Compose v2 separado, servidor/worker/migrate por imagem imutável e entrypoint
explícito. Sem build, criação de bancos, volume compartilhado ou restart automático.
Somente porta loopback do servidor. Segredos/origens/banco/porta externos exigidos.
Preflight CLI não carrega .env, não conecta a serviços e não libera produção.
[Contrato e limites](../production-distribution.md).

## Verificações

- Vinte testes unitários aprovados: campos obrigatórios, imagem por tag recusada,
  banco de sistema/hub/sem senha, origem insegura, chave de exemplo/trivial e
  porta inválida; estrutura separada do compose e detecção de mudanças de runtime.
- Typecheck, lint dirigido e build aprovados.
- `docker compose ... config --quiet` aceitou valores sintéticos e recusou ausência
  da chave. Nenhum serviço foi iniciado. O Docker informou que o config privado
  do usuário não estava legível no sandbox; não foi necessário acessá-lo para
  interpolar/validar o arquivo. Não ocorreu pull, autenticação ou publicação.

Código da rodada no [inventário SHA-256](2026-10-19-production-configuration-files.json).
São provas locais de configuração, não homologação instalada ou aceite da imagem.
Guards atuais do entrypoint/servidor/worker continuam recusando produção.

## Pendências

Provisionar e homologar banco/grants, supervisor, proxy/TLS, backup/restauração;
associar imagem aos gates aceitos e ensaiar corte antes de substituir entradas.
Não há autorização de deploy, commit ou push. Manifesto permanece ready:false,
HTTPS e ChatGPT manuais. A composição preparada não conta como produção concluída.
