# Revisão do reset — 2026-10-19

Corrigido o filtro de namespaces: `LIKE 'pg_%'` tratava `_` como curinga e
ignorava schemas de usuário como `pgx`. A conferência agora usa prefixo literal
`^pg_`. Nenhuma tabela desconhecida é adicionada à lista de truncamento.

A suíte integrada de reset foi repetida em PostgreSQL 17 Alpine exclusivo:
um cenário aprovado, incluindo `pgx.protected` com dado sintético preservado
após a recusa. Casos anteriores de rollback, marca, schema, checksum, conexão,
CLI e reaplicação também passaram. Typecheck, lint dirigido e build aprovados.

Contêiner, volume e banco descartáveis foram removidos após verificação de
propriedade. Nenhuma fonte operacional foi utilizada. Os hashes atuais estão no
[inventário](2026-10-19-development-reset-review-files.json); o inventário anterior
permanece histórico. A rodada não certifica outros subsistemas ou produção.
Manifesto permanece ready:false; HTTPS e ChatGPT continuam manuais.
