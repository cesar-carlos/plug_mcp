# Retirada de concessão externa pelo console — 2026-10-20

## Candidato

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Teste `tests/persona-v2-browser/persona.spec.ts`, SHA-256 após formatação:
`13F010B8E4E1780B54D8F3052FB9CBD633548F88E137C11D0F86D71BCED9299D`.
Código funcional e bundle são os da rodada de concessões externas do mesmo dia.

## Resultado

Pelo wrapper Node do projeto:
`npx playwright test --config playwright.persona-v2.config.ts --grep "consumidor prepara ação externa publicada"`.
Um teste Chromium passou em 5,2 segundos, viewport 390 pixels.
Lint dirigido e formatação passaram.

O cenário emite token pelo console e prepara ação sem enviá-la. Depois edita
o token e retira somente o ID da operação externa, preservando integralmente
a concessão da skill. Repetir a chamada MCP diretamente com o mesmo Bearer
é recusado e não acrescenta preparação no banco. Outro token da mesma persona,
com concessões independentes, consegue preparar e acrescenta exatamente um
registro. Nenhuma ação é enviada a provedor.

A primeira tentativa parou ao interpretar resposta SSE como JSON. O teste
passou a ler ambos os formatos e conferir o ID da resposta. Não foi alterado o
protocolo ou a autorização para acomodar o teste.

## Ambiente e limites

PostgreSQL 17 exclusivo em container aleatório; autoridade e provedor sintéticos.
Cada tentativa removeu seu container no finally e descartou a variável de
conexão. Não houve acesso a fonte ou integração operacional.
Não certifica OAuth/refresh concorrente, revogação remota, serviço externo real,
três motores, infraestrutura instalada ou IA consumidora. HTTPS/ChatGPT seguem
manuais. Evidência parcial de `oauth-and-console` e `external-rest-and-mcp`;
não encerra gates nem libera deploy.
