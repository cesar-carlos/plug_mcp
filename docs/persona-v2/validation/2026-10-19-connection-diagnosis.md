# Diagnóstico visual das fontes — 2026-10-19

O console agora exige fonte/dialeto correspondentes e indicadores explícitos na
resposta de verificar_fonte antes de apresentar confirmação positiva. Cada skill
mostra fontes verificadas e pendentes, sem interpretar confirmação parcial como
autorização. Recursos/SQL continuam sendo verificados na execução. Limites do
servidor aparecem em lista legível; navegador não calcula concessões ou defaults.

## Verificações

- 76 testes da interface em 21 arquivos aprovados. Casos novos recusam resposta
  ausente, outra fonte, outro dialeto e indicadores incompatíveis; cobrem múltiplas
  fontes, confirmação parcial, concessão local bloqueada e limites sem defaults.
- Tipos, lint da interface e build aprovados.
- Chromium dirigido: uma jornada aprovada em 14,2 segundos. Cria persona, cadastra
  duas bases, treina/publica, emite token, verifica uma fonte, confere a pendente e
  consulta os dados. Backend PostgreSQL isolado com hub sintético.
- Não houve alteração de contratos públicos do hub, migrations ou autoridade.

Node 24 pelo wrapper do projeto. Fixture PostgreSQL 17 com nome
se7e-diagnosis-20261019 e label se7e.fixture=diagnosis-20261019. Somente recursos
dedicados; não usa fontes do usuário. Esta rodada não prova o transporte instalado
dos três motores nem o diagnóstico detalhado de todos os portões remotos.

Código: ConnectionPanel.vue, connection-diagnosis.ts e seus testes; jornada em
tests/persona-v2-browser/persona.spec.ts. Alterações locais sobre a base MCP
136b5bfc8f7104b753bbd3703c9ffda196fdd51f. Evidência dirigida não substitui a rodada
integral do candidato final. HTTPS/ChatGPT manuais e deploy bloqueado.
