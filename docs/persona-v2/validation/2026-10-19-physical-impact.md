# Impacto de perfis físicos — 2026-10-19

## Entrega e alcance

Mapa paginado por versão exata de perfil físico, acessível no editor antes da
suspensão separada. Reutiliza dependências diretas/transitivas e filtro pelo
responsável do mapa de padrões. Exige sessão Client, participação no catálogo,
fonte ativa, acesso remoto vigente e identidade/hash do perfil conferidos.
Skill que adota apenas o padrão-base não é dependente da particularidade.
Metadados de fontes/publicações não confirmam disponibilidade de execução.

Não houve migration, SQL em fonte de usuário, alteração do contrato público do
hub, publicação de imagem ou deploy. A autorização remota destes testes é
sintética; não constitui homologação nos três motores.

## Evidências locais

- Duas suítes PostgreSQL: 32 testes aprovados em 55,57 segundos.
- Após acrescentar recusa explícita de perfil de outra identidade física:
  12 testes de curadoria aprovados em 14,57 segundos.
- Tipos backend/frontend, lint, 73 testes web e build aprovados.
- Chromium: um percurso de inspeção/publicação/adoção aprovado em 2,0 minutos,
  incluindo leitura do impacto vazio antes da adoção do perfil. O worker terminou,
  mas o servidor auxiliar reteve a finalização; encerrados somente os processos
  comprovados da fixture. Essa limitação de teardown continua pendente.
- Casos dirigidos conferem vínculo exato, fontes retornadas, perfil ausente,
  fonte ausente, outra identidade e revogação remota. Isolamento entre responsáveis
  e paginação permanecem cobertos pela suíte compartilhada.

## Candidato

Checkout local alterado. SHA-256 dos arquivos desta implementação:

- Serviço `physical-profiles.ts`: `e8bd8f0413b985bc7d81d8a62d9c5396b63086239ffb9daa8d4c365f771b5fbd`.
- Persistência `shared-knowledge.ts`: `455488ed1b518dd4f9d0c02b6983c4f8bacd403da1527c39daddc0fd60ff81c1`.
- `KnowledgeImpact.vue`: `d661808e8b0a8f43aaaed32735ce16c654f0fcd2a4cf0cef9977a398ed6f6d20`.
- `PhysicalProfileEditor.vue`: `540aae381f1797404d26aa864ca3326bae293d8cb247743924d308d23ab2a292`.

Detalhamento por recurso, matriz adversarial ampliada e aceite instalado ainda
pendentes. HTTPS/ChatGPT permanecem manuais. `ready: false`, nenhum gate encerrado.
