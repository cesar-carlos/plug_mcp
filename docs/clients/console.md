# Console de manutenção no navegador

A SPA em `/app` deixa o usuário cadastrar a conexão com o plug_server e manter persona, skills, grafo e operação. Não cria User, Client nem Agent no hub. Um Bearer continua sendo uma persona.

## Abrir

Depois do build (`npm run web:build`), o Express serve `web/dist` em `/app`. Produção: `https://mcp.se7esistemassinop.com.br/app/conectar`. A aba usa o ícone Se7e (`web/public/`: favicon, apple-touch e PNGs 192/512).

## Criar a conexão

`/app/conectar` chama `POST /app/api/setup/registrar` (sem segredo), lê CSRF em `GET /app/api/setup/:code` e envia e-mail, senha, `agentId`, dialeto e `client_token` no POST já existente de `/setup/:code`. A tela agrupa conta do hub, acesso SQL e confirmação; o contrato do POST não muda. O Bearer aparece uma vez. `/app/conectar/colar` só guarda o token na memória da aba.

Segredos não vão para `localStorage` nem para arguments de tools. Recarregar a página pede o Bearer de novo.

## Manutenção

Com Bearer, `/app/api/*` chama os mesmos casos de uso das tools MCP. `acessoId` de outra persona continua `VALIDATION_ERROR`. Rotação e credenciais reusam `/setup/:code`.

O menu autenticado agrupa esta persona, catálogo, operação e sessão. **Sair** esquece o Bearer e a skill aberta nesta aba e volta a `/app/conectar/colar`; não apaga a persona nem o catálogo. A tela de acesso mostra status, dialeto e o estado SQL; `unknown` vindo do cofre aparece como “não consultado”, porque o cofre não lê a policy ao vivo — isso continua em Verificar hub. Listas vazias de skill, anotação, alerta e lacuna dizem que não há item, em vez de uma tabela em branco. Escopo abre com empresa, filial, fuso e vínculos já gravados. Grafo, treino, consultas, verificação, painel e o diff de publicação mostram lista; o JSON fica recolhido. Skill com SQL ilegível aparece na lista com a falta, sem esconder as outras. **SQL de treino** (`/skills/sql`) lista o `sqlModelo` de cada skill fechado, com filtro por trecho e por SQL ilegível, e grava só o cartão confirmado via `atualizar_skill` (`GET /app/api/skills/modelos`). A tool MCP `listar_skills` continua sem SQL. Em Consultas, abrir uma linha lê o SQL em `GET /app/api/consultas/:id`; a lista continua sem SQL e a troca do exemplo segue o preview de `salvar_consulta`.

`/app/conectar/outra` mostra o Bearer novo e mantém a persona da aba. A publicação da skill só abre quando `fluxoTreino.proximoPasso` é `publicar_skill`. O hash fica na memória do Pinia. Params, anotações, escopo com vínculo de coluna, JOIN, consulta inativada, alerta, lacuna e webhook têm formulário próprio.

Contrato do cofre: [vault-and-mcp-token.md](../auth/vault-and-mcp-token.md). Tools: [tools.md](../mcp/tools.md).
