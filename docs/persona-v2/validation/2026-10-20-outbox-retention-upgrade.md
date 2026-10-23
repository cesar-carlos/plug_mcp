# Upgrade da retenção da outbox — 2026-10-20

Fixture PostgreSQL 17 reproduz quarenta migrations com os checksums originais,
semeia notificações terminal/pendente com cifras e outbox histórica sem assinatura.
Upgrade aplica 0041/0042 e reaplica o runner sem mudar migrations antigas.

Sete testes em dois arquivos passaram em 2,52 s, início 10:44:06.
Confere prazo conservador na migração, preservação de metadados, recusa da
promoção de registro histórico, limpeza das cifras no terminal envelhecido,
pendência intacta, deduplicação e imutabilidade. Contêiner próprio removido.

A revisão encontrou que UPDATE sem alteração poderia renovar o horário terminal.
Migration aditiva 0042 restringe a atribuição à transição de pendente para terminal.
O teste confirma estabilidade do horário após UPDATE neutro. Não foi alterada
a migration 0041 já aplicada nas fixtures anteriores.

Tipos e lint dirigido passaram após corrigir tipagem do teste e retirar await
de método síncrono. Isso não altera o comportamento exercitado.

## Candidato local

Build Node 24.21 / TypeScript 7.0.2 passou, preservando avisos de dependências
e bundle do console. Sem publicação.

- Configuração: sha256:fef026419f2cf274cff817ad42b2a4fa4037220391ced5088d644a5b5a3c87cc.
- Manifesto OCI: sha256:2a875eba8506911748bf3c29168165f9a97abed4971d7dbff05850e9b4112730.
- Migration 0042 SHA-256: 638421B5B9D23C22EC5DB32C1FE309C26807FCCFC6BE9B46BE6D130A5FFF1E28.
- MCP base: 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.

test-persona-candidate.ps1 passou com 42 migrations, assets, quatro jobs,
reinício e backup/restauração; recusou produção, falta de segredo, comando
inválido, legado/checksum e DDL automático no startup. Limpeza confirmada.
Esse ensaio usa hub inválido e não comprova treinamento pela cadeia.

## Limites

Não certifica rotação concorrente com limpeza, carga ou infraestrutura instalada.
Treinamento da imagem anterior não certifica automaticamente esta imagem.
HTTPS/ChatGPT manuais, ready:false e gates sem alteração. Sem commit ou deploy.
