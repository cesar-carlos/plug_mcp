# Primeiro deploy remoto de teste v2 — 2026-10-25

Commit publicado: `7381c0c8c75659671ca226917bb2f24611ce233c`, em `main`.
[CI aprovado](https://github.com/cesar-carlos/plug_mcp/actions/runs/40193018551)
e [deploy aprovado](https://github.com/cesar-carlos/plug_mcp/actions/runs/40194075147).
Ativação pública às 12:41 UTC no servidor autorizado `srv815734`.
Console: <https://mcp.se7esistemassinop.com.br/app>.

## Evidência técnica

- CI: documentação Linux/Windows, release:check, contrato fixado do hub, auditoria
  de dependências, imagens amd64/arm64, candidata v2 e test-server aprovados.
- Linux: 1.784 testes gerais, 329 de persistência v2, 8 de cache e 86 do console.
  Navegador: 17 cenários legados, 62 v2 e 11 HTTPS/OAuth. Não somar suítes como
  cobertura independente; a rodada local anterior tinha outra contagem.
- O deploy validou a origem exata e os jobs antes de transferir o arquivo do CI.
  Sem reconstrução no servidor. Imagem ativa nos dois serviços:
  `sha256:2410ec4fd60e42559bb511385f0e5ebb8e68b4ffef3e60a2a0a2272a14c35531`.
- SHA-256 do arquivo recebido:
  `bb1cb83652a0f5d215025cb89c324fae7a3ec816f008da83c87ff29898f7d4e0`.
  Diretório preservado: `/var/tmp/se7e-persona-test.igQcY2l2`.
- Banco novo e dedicado, vazio antes da migração; 43 migrations aplicadas
  explicitamente. Servidor e worker saudáveis, sem reinícios na verificação.
- HTTPS `/health` e `/ready`: geração persona-v2, ready verdadeiro e
  `complete: false` preservado. Chromium carregou console, formulário e assets
  sem erros de página ou falhas HTTP nos assets.
- Administração anônima recusada, origem indevida recusada e Bearer inválido
  recusado. MCP anônimo expõe somente a tool pública de treinamento; tools do
  catálogo privado não ficam disponíveis.

## Configuração e operação

Node 24.21.0 instalado de distribuição oficial com SHA-256 conferido. Receptor
`/usr/local/sbin/plug-mcp-deploy` atualizado, cópia anterior preservada. A chave
existente conserva comando forçado e opção OpenSSH `restrict`.

Configuração em `/etc/se7e/persona-v2-test.env`, root:root e modo 0600. Chave do
cofre e senha do banco geradas no destino, sem cópia do legado ou saída em logs.
PostgreSQL dedicado em `se7e-persona-v2-test-database`, sem porta publicada;
infraestrutura em `/etc/se7e/persona-v2-test-infra.yml`. A rede dedicada
`se7e-persona-v2-test_default` foi preparada com os labels esperados pelo Compose.
OAuth e cache permanecem explicitamente desligados neste primeiro destino.

Nginx encaminha o domínio MCP para `127.0.0.1:3335`. Sua configuração passou em
`nginx -t` antes do reload. MCP legado `plug_mcp-mcp-1` parado com exit 0 e
restart desabilitado; banco, imagem e configuração antigos preservados. O hub
continuou saudável. A candidata isolada anterior não recebe o tráfego público.

Backup diário às 03:17 UTC por `/usr/local/sbin/se7e-persona-v2-test-backup`,
agendado em `/etc/cron.d/se7e-persona-v2-test-backup`. Guarda dump, configuração
e keyring em diretórios privados sob `/var/backups/se7e-persona-v2-test`.
Primeiros backups concluídos antes e depois das migrations. O dump posterior
foi lido por `pg_restore --list`; isso não equivale a uma restauração completa.
Não existe nesta evidência cópia externa ao servidor ou política de expurgo.

Aplicação e worker mantêm `restart: no`: após reboot/falha, usar o diretório
de release preservado, o arquivo privado e o ID imutável acima para iniciar
explicitamente os serviços pelo Compose. Não repetir o deploy para repetir
operações. O checkout `/root/plug_mcp` recebeu `origin/main` por fetch; o receptor
exportou o commit para o diretório de release, sem modificar o checkout antigo.

## Ajustes e limites

A primeira sonda MCP esperava HTTP 401 em initialize anônimo. O contrato permite
inicialização e guia públicos. A sonda foi corrigida para conferir exposição
somente do guia, ausência de tools privadas e recusa de Bearer inválido; passou.
Nenhuma proteção do servidor foi removida. A conferência inicial da chave SSH
procurava opções individuais; o destino usa a opção equivalente `restrict`.

Não houve login Client real, cadastro de fonte operacional, consulta de negócio
ou instalação/conversa no ChatGPT nesta rodada remota. Essas jornadas têm
evidência automatizada em fixtures no CI, sem certificar dados/autoridade do
destino. Aprovações Client permanecem obrigatórias quando aplicáveis. Não houve
transferência de dados, tokens ou credenciais legadas. Nenhum dos treze gates
integrais foi declarado aceito; a autorização é somente para servidor de teste.
