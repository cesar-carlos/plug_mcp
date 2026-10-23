# Painel de testes de consulta — 2026-10-19

## Entrega

Console apresenta casos, relatórios paginados e situação técnica da revisão
salva. Sessão Client usa serviços existentes, com guardas administrativos.
Rotas GET testes-consulta e POST casos-consulta permitem leitura e edição CAS;
o painel é de leitura. Editor visual de casos permanece pendente.

Não executa SQL/runner, publica ou aprova. Edição local, revisão/contexto novo
ou erro removem dados anteriores. Respostas atrasadas são descartadas; páginas
não são combinadas se pacote/casos/revisão divergirem. [Contrato](../console.md).

## Validação

- Um cenário Chromium passou em 6,9 segundos, com PostgreSQL real de fixture e
  hub sintético: treino publicado, leitura vazia, edição local limpa/desabilita,
  alteração concorrente pela API administrativa e recusa da revisão antiga.
- Foco no resumo de erro e ausência de overflow em 360/390/768/1280 pixels.
- Frontend: 73 testes, tipos, lint e build aprovados; backend tipos, lint dirigido
  e build aprovados. Avisos não fatais de annotations Zod no build.
- Teardown removeu bancos temporários e estado; contêiner/volume próprios
  removidos após verificar identidade/rótulo. Sem fonte operacional.

Base MCP: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
SHA-256 painel: `4aadc2fe9bc0f707f3fa9c26fc8304983d4190088d30168fd2d464e6a09c9d3c`.
SHA-256 rotas: `2be7626b21c29b818693860d05ad943759f851d9e94b4614d95aa8716feb035c`.

Não é regressão Chromium integral, validação dos runners/cadeia instalada ou
acessibilidade integral. HTTPS/ChatGPT manuais, ready:false e gates abertos.
Nenhum contrato público do hub, migration ou deploy alterado.
