# Edição delegada de casos de consulta — 2026-10-19

## Entrega e limites

`editar_caso_skill` e POST administrativo do consumidor aceitam `kind: consulta`.
O caso usa o schema do runner de consulta isolado, com parâmetros, sementes
tipadas e resultado esperado. Reutiliza a transação autorizada, treinar,
concessões, delegação e revisão/CAS. [Contrato](../catalog.md).

Cadastro, alteração e remoção incrementam revisão; referência inexistente
reverte toda a mutação. Não executam SQL, produzem relatório, aprovam caso ou
modificam publicação ativa. Não convertem casos antigos. Execução/publicação
continuam nos fluxos separados e exigem evidência atual.

## Validação

- Suíte PostgreSQL de setup/delegação: 73 testes aprovados, sem omissões, em
  34,12 segundos. Node 24.21.0 e PostgreSQL 17 Alpine próprio; hub sintético.
- Novo cenário percorre cadastro MCP, correção HTTP, revisão obsoleta, duas
  alterações concorrentes (uma aceita, outra 409), conteúdo inválido, ID
  inexistente sem avanço de revisão, remoção, outra persona e revogação remota.
- Confere ausência de relatórios/aprovação e publicação ativa ao concluir.
- Tipos, lint dirigido, formatação e build passaram. Runtime e rules atualizados.
- Bancos temporários foram removidos pela suíte; contêiner e volume próprios
  removidos após conferência do ID/rótulo. Nenhuma fonte operacional utilizada.

## Candidato

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
SHA-256 do catálogo:
`5d43e900f94742ea4ce62be08282d3955740edc117cbaf8c071d1827df430123`.
SHA-256 dos testes:
`ac5d37f6aa713d4c2ca9d899dcbf90aebbff9f0f3422bd2f0bcb67e0c726e366`.

Sem migration ou alteração pública do hub. Não certifica execução dos casos,
cadeia instalada dos três motores, console ou cliente ChatGPT. HTTPS/ChatGPT
continuam manuais; ready:false e todos os gates abertos, sem publicação ou deploy.
