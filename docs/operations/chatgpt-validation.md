# Validação da integração ChatGPT

Registro local de 2026-10-06, versão 0.2.0. Melhorias implementadas e verificações automáticas locais aprovadas com Node 24.21.0. OAuth permanece desligado por padrão. Nenhuma migração foi aplicada em banco operacional; nenhuma conexão ou instalação no ChatGPT foi criada nesta validação.

## Evidências locais

- `npm run release:check`: Node compatível, TypeScript 7.0.2, base canônica, lint, formatação, typecheck, 926 testes aprovados, 3 condicionais não executados e build aprovado. A rodada final inclui os testes PostgreSQL no banco efêmero; os testes live de serviços externos não constituem este aceite.
- `npm run test:chatgpt:https`: 15 testes aprovados. Transporte HTTPS nativo, callbacks DNS scalar/all com IPv4/IPv6, SNI/hostname, CA sintética confiada somente no teste, documento válido/JSON inválido, certificados recusados, redirect, resposta interrompida, limite, deadline e cache vencido/rebinding.
- `npm run test:chatgpt:browser`: 4 testes aprovados em Chromium real e HTTPS, usando PostgreSQL efêmero próprio. Cookie/CSRF/Origin/nonce, consentimento, cancelamento, expiração, histórico/reenvio, refresh/replay, separação de concessões, revogação e Bearer legado. Callback em outra origem recebe GET, sem corpo de credenciais nem Referer; traces/vídeos/screenshots estão desligados.
- `npm run test:migrations`: instalação nova e upgrades históricos em bancos efêmeros, incluindo 0033→0034. Nenhuma nova migração para estas melhorias. Código/refresh concorrentes, replay, revogação anterior à gravação, rollback multirrepositório, publicação/remoção concorrentes e rotação com entrega terminal do Bearer. Teste adicional confirma gravações simultâneas envolvendo dois acessos com locks ordenados; locks adicionais dentro de escopo vigente são recusados.
- `npm run runtime:check`: servidor ready, worker em execução e PNG nativo confirmados no Node 24.21.0.
- `npm run contract:check` no checkout do plug_server: contrato compatível e projeto preservado.
- Testes MCP verificam o JSON de `tools/list` recebido pelo cliente nos protocolos legado e moderno: `securitySchemes` principal e em `_meta`, com catálogo compartilhado. Desafios incluem descrição fixa nas falhas OAuth; ausência de credencial e erros do hub/SQL não são confundidos.
- Unidade de trabalho explícita PostgreSQL e memória: seis testes unitários de rollback, reaproveitamento de escopo, revogação, expiração no commit, locks declarados e recusa de chamada ao hub dentro da transação. Verificação arquitetural impede imports de pool/adapters nos casos de uso.
- Empacotamento valida conexão exclusiva, URL, variante, skills e metadados de montagem `se7e-package.json`; recusa placeholders, ambiente divergente e MCP duplicado. Identificadores sintéticos são usados somente em testes; não há artefato final instalado com ID fictício.

## Comando de prontidão

`chatgpt:check` executou consultas somente leitura no PostgreSQL efêmero migrado. A etapa prepare usou URL HTTPS sintética para validar configuração; não comprova disponibilidade dessa URL.

| Cenário                                                                                         | Resultado                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `--stage=prepare --json`, flag desligada, allowlists vazias e configuração válida               | Saída 0                                    |
| `--stage=prepare --json`, URL pública HTTP                                                      | Saída 1                                    |
| `--stage=pilot --json`, sem pacote/identificador real                                           | Saída 2                                    |
| Contratos completos do piloto com dependências sintéticas injetadas nos testes                  | Saída 0; homologação `not_verified`        |
| Falhas de banco/CIMD/pacote/discovery, migração ausente, acesso revogado e runtime incompatível | Saída 1 nos testes; sem detalhes sensíveis |

A etapa pilot real ainda requer URL HTTPS pública, allowlists elegíveis e pacote ligado ao identificador real da conexão. O comando não aplica migrações, emite tokens nem autoriza acessos. Todo relatório declara instalação/homologação no ChatGPT não verificadas.

## Homologação pendente

Usar somente dados sintéticos e registrar versão, resultado e IDs permitidos, sem tokens, SQL, perguntas ou resultados.

| Verificação                                                           | Estado   |
| --------------------------------------------------------------------- | -------- |
| Implantação HTTPS pública, proxy sem logs sensíveis e PostgreSQL      | Pendente |
| CIMD, redirects e identificador real da conexão privada               | Pendente |
| `chatgpt:check --stage=pilot` contra ambiente real                    | Pendente |
| Instalação, skills carregadas, consentimento e persona correta        | Pendente |
| Consulta com filtro/agregação/paginação e negativa fora da publicação | Pendente |
| Anexo permitido apresentado no ChatGPT                                | Pendente |
| Treino, validação, preview e publicação com confirmação humana        | Pendente |
| Refresh, reconexão, revogação e rollback sem recuperação de tokens    | Pendente |
| Duas personas em conexões distintas e clientes manuais preservados    | Pendente |

Aplicar 0034 com flag desligada; implantar e verificar Bearers existentes; executar prepare; disponibilizar discovery com allowlists vazias; cadastrar a conexão; configurar valores reais e acessos do piloto; montar variante ChatGPT; executar pilot e homologar antes de ampliar acessos. Distribuição privada não equivale a isolamento criptográfico por workspace.

Rollback exige desligar/reiniciar e executar `npm run oauth:revoke -- --all --confirm`. Reativação não restaura credenciais revogadas. Ver [contrato operacional](../auth/chatgpt-oauth.md) e [instalação do pacote](../../plugins/se7e-chatgpt/README.md).
