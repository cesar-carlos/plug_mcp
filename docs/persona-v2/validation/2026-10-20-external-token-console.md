# Concessões externas no console — 2026-10-20

## Escopo e candidato

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f` com alterações locais.
Seleção de publicação externa na emissão/edição acrescenta capabilities e ID
exato da operação, com efeitos SQL vazios. Ações novas exigem aprovação
adicional; consulta externa não recebe essa exigência adicional.
Editor permite retirar concessão de operação sem apagar outras permissões.
Não houve mudança de contrato remoto, migration ou publicação de produção.

SHA-256 dos arquivos do candidato:

- `web/src/persona-v2/publication-grant.ts`: `1BB94551F083DF8A08496EA3BBDC696D6AB9098FA1A8512F73E6DC39B2551151`
- `web/src/persona-v2/PersonaConsole.vue`: `73EDEC40B9F3AD02258BB8A0CD3ACDF489F630067962BB7D7172B5A81153B2A0`
- `web/src/persona-v2/TokenManager.vue`: `4BB8EA3DDE33647EDE4108AE18F45B72C37E7C762FBFC4987E8AF2587007003B`
- `tests/persona-v2-browser/persona.spec.ts`: `9B684383028259F2F2D0724414718FD13B8E3500CADA964A0F8522FDE720E9F6`

## Verificação

Pelo wrapper Node do projeto:

- `npm run test --prefix web`: 83 testes em 22 arquivos passaram.
- `npm run typecheck --prefix web`, lint web e formatação dos arquivos alterados passaram.
- Build web passou, com avisos de comentários Zod e chunk acima de 500 kB;
  otimização de distribuição permanece pendente, sem alterar o limite do aviso.
- Chromium dirigido ao caso `consumidor prepara ação externa publicada`:
  um teste passou em quatro segundos, viewport de 390 pixels.

O cenário emite o token pela interface, confere uma operação externa, skill
exata, efeitos SQL vazios e aprovação adicional. Usa esse Bearer para preparar
a ação e verifica `aprovacao_pendente`, publicação correta e ausência de claim.
Não envia efeito ao serviço externo.

Primeira tentativa parou no seletor de persona do teste; corrigido para o
combobox pelo nome acessível. Segunda tentativa usou o bundle anterior e não
encontrou a capacidade externa. A rodada final acima usou o build atualizado.

PostgreSQL 17 e container exclusivos, autoridade e provedor sintéticos.
Container removido no finally e variável de conexão descartada em cada rodada.
Testes não usaram fontes, credenciais ou integrações operacionais.

## Limites

Evidência parcial de `oauth-and-console` e `external-rest-and-mcp`.
Não certifica edição/rotação visual completa, provedor real, cadeia dos três
motores, HTTPS público, ChatGPT ou avaliação da IA. Essas verificações continuam
separadas. `ready:false` e deploy bloqueado permanecem obrigatórios.
