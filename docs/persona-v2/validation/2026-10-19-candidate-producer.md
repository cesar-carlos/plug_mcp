# Produtor CI da imagem candidata v2 — 2026-10-19

## Entrega

Job separado persona-v2-candidate constrói o alvo explícito e executa a fixture
empacotada antes de exportar persona-v2-tested-image-amd64. Não possui permissão
packages:write nem login/push. Publicação incompleta é omitida com mensagem de
bloqueio; os demais checks precisam passar para uma rodada produtora ter sucesso.
Ready:true continua exigindo gates/artefato aceitos. Nenhum workflow foi disparado.

O ensaio recebe -Image, resolve ID/entrypoint antes de criar recursos e fixa esse
ID em todos os serviços. Run usa --pull never; imagem ausente é erro. Preserva
separação de banco/Redis, recusas de produção/legado e limpeza por propriedade.

## Validação local

22 testes dirigidos passaram (artefato, origem e bloqueio de release), tipos
backend, lint dos testes, docs:check e actionlint 1.7.9 sem rede passaram.
Build Docker local do checkout atual concluiu backend e frontend. Imagem observada:
sha256:9de3557cb462bd359d2a0339da309cc8c97d05631998b06e966354638b8527be.

Fixture final passou: 40 migrations, recusa de produção/chave ausente/comando
inválido/legado/checksum, startup sem DDL, reaplicação, assets, quatro jobs e
reinício. Contêineres, volumes e diretório temporário tiveram limpeza confirmada.
Duas tentativas anteriores recusaram o ensaio por flag --no-build incompatível
com compose run; foram limpas. Corrigido para --pull never, conservando ID fixo.

Exportação da mesma imagem foi gravada e conferida com record/verify-loaded:
97.172.992 bytes, SHA-256 do arquivo
92b92682a1cfdd23d7105acb9cb3e8b141784a7306073a95f2c57b12b0a4b269.
Arquivo temporário foi removido; imagem local preservada, sem push. O ID foi
obtido por Docker inspect; não se presume que seja digest do config ou do registro
em todos os tipos de armazenamento Docker.

Base MCP 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais;
[hashes funcionais](2026-10-19-candidate-producer-files.json). GIT_SHA da imagem
identifica a base, não torna as alterações locais um commit aprovado. Node 24.21.0,
TypeScript 7.0.2; Docker Desktop Linux/amd64 e PowerShell Windows.

## Limites

Não exercita o job Ubuntu no GitHub nem armazenamento/download de artifacts.
Não homologa hub/agente instalados, treinamento real nesta imagem, três motores,
HTTPS/ChatGPT, IA ou corte. Auditoria npm do build reportou quatro vulnerabilidades
moderadas nas dependências de desenvolvimento; produção reportou zero. Avisos de
annotations Zod no build frontend foram não fatais. Nenhum gate encerrado e
ready:false preservado. Contratos públicos do hub inalterados.
