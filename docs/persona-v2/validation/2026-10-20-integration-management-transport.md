# Transporte da gestão delegada de integrações — 2026-10-20

Rotas consumidor Bearer/OAuth e três tools MCP usam o serviço de gestão com
escopo explícito. Criação/rotação de segredos continua no navegador.
Handlers não aceitam persona arbitrária; usam identidade autenticada.
Suspensão/recuperação exigem schema estrito de versão, fingerprint e confirmação.

20 testes passaram em três arquivos, 2,61 s, início 11:04:40. Transporte
HTTP/MCP com SDK real e autoridade de fixture: descoberta/annotations,
encaminhamento de identidade, suspensão/recuperação, cookie recusado,
chamada direta após revogação e retirada da descoberta. Testes de serviço
conferem escopo/CAS; não há hub ou banco real nesta rodada.

Tipos, lint dirigido e build passaram. Seletores do console, consentimento
OAuth explícito e homologação persistente continuam pendentes. OAuth atual
não herda IDs administrativos sem consentimento. Não anunciar fluxo completo.

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
Imagem anterior não inclui os novos handlers. HTTPS/ChatGPT manuais,
ready:false e gates inalterados; sem commit, publicação ou deploy.
