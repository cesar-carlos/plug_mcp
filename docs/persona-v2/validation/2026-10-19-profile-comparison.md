# Comparação de perfis físicos — 2026-10-19

## Entrega

Endpoint administrativo e console com comparação de dois snapshots publicados
do mesmo perfil. Serviço confere catálogo, identidade física, hashes, padrão-base
e acesso remoto vigente. Diferenças usam conteúdo exato e IDs estáveis; comparação
não modifica rascunho, adoção, publicação ou concessões. Não houve migration nem
alteração do contrato público do hub.

## Evidência dirigida

- PostgreSQL 17 isolado: 11 testes de curadoria física aprovados em 12,02 segundos,
  incluindo diferenças entre revisões, comparação idêntica, versão inexistente
  e revogação remota.
- Chromium: um percurso de inspeção/publicação/adoção aprovado em 2,2 minutos,
  incluindo comparação sem adoção automática e preservação da publicação anterior.
  O seletor do teste foi corrigido para usar o papel acessível de combobox.
- O processo do teste terminou antes da limpeza do servidor auxiliar. A finalização
  ficou retida; somente os processos conferidos dessa fixture foram encerrados.
  Esse problema de teardown não é apresentado como parada operacional homologada.
- Tipos e lint dos arquivos afetados aprovados. `docs:check`: 170 arquivos,
  1.061 links, 13 gates e zero problemas. Contêiner/volume próprios removidos
  após conferência de ID, nome e rótulo.

Hashes SHA-256 do checkout testado:

- `physical-profiles.ts`: `ce3c72d7201598d47a3dc71db93da373fe39aecad47777397b00b26cfc68daef`.
- `PhysicalProfileComparison.vue`: `ba058adc416f6a96f4abae17d7d5959d5139eee6b2d53750d578a494f4492529`.
- `physical-curation.postgres.test.ts`: `c3073ef947e50c6d2af3acfdb99a0afdeb15ea6b0fe1673207bbc40257fa7347`.

Hub sintético e PostgreSQL de controle/dados dedicados: esta rodada não certifica
transporte nos três motores, instalação desktop, HTTPS, ChatGPT ou avaliação da IA.
Não executou SQL em fontes do usuário. O candidato é o checkout local alterado,
não uma imagem aprovada; relatórios anteriores não certificam estas mudanças.

Histórico editorial ampliado, mapa de impacto e demais combinações adversariais
continuam no plano restante. Nenhum gate encerrado; `ready: false` preservado.
