# Administração editorial externa com hub persistente — 2026-10-19

## Escopo e isolamento

Cenário dedicado em persona-chain.test.ts, modo Prisma. MCP e hub usam bancos
PostgreSQL 17 separados da fixture; Client, login, perfil, criação/verificação e
revogação da delegação usam adapters e rotas reais. A composição MCP não recebe
overrides de autoridade ou transporte. Persona e token próprios, sem credenciais
operacionais. PostgreSQL, SQL Server e SQL Anywhere são provisionados pela fixture
existente, mas este cenário não certifica SQL, constraints ou efeitos nesses motores.

Contrato externo e relatório inicial são preparados com dados sintéticos por
serviços editoriais de teste. O provedor não é homologado; nenhum efeito externo
é disparado pela jornada testada. Não representa aprovação semântica de contrato
real, instalação do agente desktop, OAuth completo ou avaliação da IA.

## Cenários

- Token com treinar, skill/operação publicadas concedidas e delegação real lê casos.
- Edição MCP usa revisão vigente; repetição com revisão antiga é recusada.
- Fechar e reconstruir a composição MCP preserva casos/revisão e torna o relatório
  anterior obsoleto, mantendo a identidade da publicação ativa.
- Revogar diretamente pela API do hub mantém deliberadamente o registro local
  ativo; descoberta/chamada MCP e leitura HTTP administrativa são bloqueadas.
- A revogação local posterior conclui manutenção sem restaurar acesso.

A reconstrução do MCP ocorre no mesmo processo de teste, com novos serviços/pools;
não é queda abrupta nem reinício do processo do hub. O hub permanece um processo
independente com Prisma durante a rodada. Não há promessa de atomicidade distribuída.

## Validação

Rodada final dirigida: **1 caso aprovado em 22,97 segundos**; os demais 78 casos foram excluídos pelo filtro explícito,
sem usar isso como aceite da matriz. training:check validou o pin e snapshot antes
do startup. Tipos, lint dos dois testes, build e formatação passaram.

A primeira rodada encontrou expectativa incorreta no teste: após revogação, a
ferramenta é omitida e retorna erro JSON-RPC -32602 em vez de resultado isError.
O teste agora reconhece ambos os caminhos de recusa, sem alterar autorização.
Uma segunda rodada passou; a rodada final preserva o cenário apenas no modo
Prisma, como os outros testes persistentes. Modo memory não certifica este cenário.

Teardown fecha MCP, hub e agente; o provisionador remove somente seus contêineres,
instância SQL Anywhere, DSN privado e diretório temporário. HTTPS e ChatGPT continuam
para validação manual. ready:false e gates abertos, sem deploy, push ou migrations novas.

## Revisões

- MCP base: 136b5bfc8f7104b753bbd3703c9ffda196fdd51f, com alterações locais.
- Hub: 0dc94d6990167f65e093b1fb68a8150630e2057c.
- Agente: 3b4f099e64a319a100cd93e00667ffca4afef732.
- Node 24 pelo wrapper; versões nativas adicionais não foram coletadas por este filtro.

Hashes SHA-256 dos testes:

| Arquivo                                            | SHA-256                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| tests/helpers/persona-chain-external-delegation.ts | 5478b27114488abfe7ebf84476df86a2c8225c9aa092e221b0563b951eb3db64 |
| tests/homologation/persona-chain.test.ts           | f76fda69d77e3ac5fe67bc46c68183d0fedcb5e5e3cde6386af9e506d5a2ec4f |
