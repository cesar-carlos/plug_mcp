# Escopo administrativo de integrações — 2026-10-20

Fundação para gestão delegada, ainda sem exposição pública completa:
managedIntegrationIds opcional nas permissões, teto de delegação e interseção
no serviço de listagem/impacto/suspensão. Credenciais permanecem no navegador.
OAuth sem seleção explícita conserva escopo vazio, sem ampliar consentimentos.

24 testes passaram em três arquivos, 684 ms, início 11:01:31. Fixtures
controladas conferem ausência de escopo, filtro por ID, recusa antes de ler
impacto oculto, conflito de versão, suspensão autorizada e OAuth sem concessão.
Tipos, lint dirigido e build passaram.

Não comprova hub persistente, transporte HTTP/MCP, consentimento real ou UI.
Esses caminhos continuam pendentes e a imagem anterior não contém esta alteração.
MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
Nenhum gate encerrado, nenhuma migration aplicada alterada. Deploy bloqueado;
HTTPS/ChatGPT permanecem manuais.
