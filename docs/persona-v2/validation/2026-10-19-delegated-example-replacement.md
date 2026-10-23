# Correção editorial delegada de exemplos SQL — 2026-10-19

## Entrega

registrar_exemplo_sql aceita replace:true para substituir o mesmo example.id
por expectedRevision vigente. A opção ausente conserva o cadastro anterior.
Duplicidade sem substituição e substituição de ID inexistente são conflitos.
Correção sempre fica candidate, mesmo quando recebe approved, e não altera
modelo, parâmetros, exemplos não selecionados ou publicação ativa. SQL passa
pela validação existente; não é executado. A unidade autorizada exige treinar,
delegação, consentimento aplicável e fontes concedidas, com revalidação local.

O alcance é o rascunho privado da persona. Não incorpora proposta compartilhada,
publica padrão/perfil, define prazo humano ou concede autoridade nova.

## Validação

Suíte setup-delegation.postgres.test.ts: **76 testes aprovados em 32,35 segundos**.
Novo caso MCP cobre substituição de exemplo aprovado por candidato, ID ausente,
DELETE recusado, revisão antiga, revogação remota simulada e snapshot preservado.
Tipos, lint dos arquivos afetados, formatação e build passaram.

PostgreSQL 17 isolado, autoridade/transportes simulados pela suíte existente.
Não certifica hub persistente, três motores, OAuth completo, UI ou efeitos SQL.
A evidência persistente anterior não certifica automaticamente esta alteração.

## Limpeza e revisão

Teardown removeu os bancos de testes. Conferência encontrou somente postgres e
persona_editorial_test. Label editorial-replace-20261019 conferida; contêiner
próprio e volume removidos. Nenhuma base ou credencial operacional foi utilizada.

Base MCP 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais. Node 24
pelo wrapper do projeto. Sem migration ou mudança no hub/agente. HTTPS/ChatGPT
manuais, ready:false e gates abertos; nenhum deploy ou publicação de imagem.

| Arquivo                                                   | SHA-256                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| src/application/persona-v2/catalog.ts                     | 6d95301c4118e7028587d7389865ace436b5b687db5553a5827089c8a7b3a0db |
| src/infrastructure/mcp/persona-v2-administration-tools.ts | efca7d1410068136b2f2ff4d5a584635c45c46025dd4466aca515e117d97053c |
| src/application/persona-v2/runtime-instructions.ts        | d75393676b197de1a57c2146e9ff15f710f758f10387b6148db0e6bf830912a3 |
| tests/persona-v2/setup-delegation.postgres.test.ts        | 58f0d94b9844e7854a86dc8878e2cdbbf48e24e400b29e66e7e6cb0d9938bd80 |
