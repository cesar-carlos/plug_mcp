# Console de manutenção no navegador

A SPA em `/app` permite cadastrar a conexão com o plug_server e manter persona, skills, grafo e operação. É destinada a técnicos e administradores, usa Vue 3, Pinia, Vue Router e Vite, com componentes próprios. Um Token MCP autentica exatamente um acesso; a interface não amplia pacote, policy ou autorização.

## Abrir e navegar

Depois de `npm run web:build`, o Express serve `web/dist` em `/app`. Produção: `https://mcp.se7esistemassinop.com.br/app/conectar`. A marca e os ícones Se7e ficam em `web/public/`.

A navegação agrupa Visão geral, Catálogo (skills, consultas, anotações), Treinamento (treino, SQL, grafo), Operação e Configurações do acesso. Remoção fica em ações destrutivas. As URLs existentes são preservadas. A persona permanece identificada no cabeçalho móvel e na sidebar. Abaixo de 860 px, o menu é recolhível, fecha após navegar e aceita Escape com retorno do foco. O conteúdo aparece abaixo do menu expandido. Tabelas rolam dentro de seu próprio contêiner.

A aparência usa o sistema por padrão e oferece Claro/Escuro. Somente `se7e-console-theme` vai ao `localStorage`. Token, SQL, dados e formulários permanecem em memória. Recarregar exige autenticação novamente. Componentes compartilham tokens semânticos de CSS, foco visível, campos SQL monoespaçados sem corretor, estados anunciados e diálogos nativos com cancelamento e retorno de foco.

## Conexão e sessão

`/app/conectar` chama `POST /app/api/setup/registrar`, lê CSRF em `GET /app/api/setup/:code` e envia e-mail, senha, `agentId`, dialeto e `client_token` no POST existente de `/setup/:code`. Nenhuma conta, Client ou Agent é criado no hub. Dialeto deve ser selecionado explicitamente. Rotação e atualização de credenciais usam o mesmo setup seguro; os portões continuam no backend.

O Token MCP aparece uma vez, com cópia por ação explícita e feedback. A exibição temporária é limpa ao sair. `/app/conectar/colar` autentica com o token somente em memória. `/app/conectar/outra` mostra o token novo sem substituir a persona da aba. **Sair** limpa stores e previews; não apaga o catálogo. Troca de sessão ou navegação cancela leituras em trânsito e ignora respostas antigas. Mutações não têm retry automático. Erros preservam `code`, `message`, `hint`, `source` e `nextAction`; um 401 do hub não é interpretado automaticamente como Token MCP inválido. Falhas de transporte/JSON usam mensagens locais, sem HTML bruto.

## Skills, treinamento e grafo

O editor abre o rascunho, separado da Publicação ativa, que pode ser lida explicitamente. Alterações locais são detectadas. Validar só usa conteúdo persistido; com edição pendente, **Salvar e validar** executa as duas ações em sequência. Falha ao salvar interrompe a validação; falha ao validar preserva o conteúdo já salvo. Navegação/troca/recarga pedem permanecer ou descartar, sem salvar automaticamente. Remover e despublicar exibem nome e consequência em confirmação específica.

A publicação tem revisão do diff e confirmação do preview vigente. Hash não é editável, fica vinculado à skill em memória e é limpo ao sair/trocar contexto. Confirmação obsoleta exige nova revisão e nova ação humana.

**SQL de treino** (`/skills/sql`) carrega `GET /app/api/skills/modelos`; cartões começam fechados, filtram por nome/SQL e preservam outras edições ao salvar um cartão. `listar_skills` MCP continua sem SQL. Pendências da skill levam `skillId` ao treino/grafo e oferecem retorno. O grafo distingue Somente grafo de Rascunho da skill. Colunas preservam classificação confirmada quando omitida; JOINs permitem múltiplos pares, cardinalidade explícita e tipo preservado ou escolhido. Conflitos usam a API existente. Treinar SQL permite levar o conteúdo em memória à criação de skill, sem criar ou publicar automaticamente.

## Consultas e anotações

Consultas usam paginação do servidor. Abrir uma linha lê `GET /app/api/consultas/:id`. Candidatas existentes são somente leitura; **Criar novo exemplo a partir deste** copia pergunta, SQL e todos os vínculos, sem reutilizar o ID. A confirmação mostra o conteúdo retornado pelo servidor, mantendo ID/hash por operação. Edição invalida preview. Inativação tem seleção, motivo e consentimento próprios, além do conteúdo canônico usado no hash. Não há reativação implícita nem substituição silenciosa de registros.

Anotações usam um formulário para criação/edição. Editar carrega texto, tipo, origem, vigência e revisão; troca/cancelamento com edição pendente exige descarte explícito. Governança não alterada é omitida; campos opcionais apagados enviam `null`. Datas civis são mostradas sem conversão de fuso. Remoção, herança de template, webhook e reenvio de entrega têm confirmações independentes. Entregas são selecionadas pela lista.

Escopo e persona atualizam o resumo após salvar. Vínculos físicos podem ser removidos explicitamente. O painel carrega auditoria, métricas, alertas e lacunas separadamente: uma falha não esconde as demais. Listas sem paginação indicam os limites da resposta. `DataView` apresenta todos os itens e colunas recebidos; JSON é detalhe recolhido.

## Organização e validação

`web/src/services/` concentra contratos e leitura de respostas por funcionalidade; views cuidam da interação, sem replicar validadores de negócio. `useAction` impede concorrência por operação e distingue resultado, falha e cancelamento. `web/eslint.config.js` usa flat config com lint tipado Vue/TypeScript; Prettier continua responsável pela formatação.

```sh
npm ci
npm ci --prefix web --include=dev
npm run web:check
npx playwright install chromium
npm run test:console:browser
npm run release:check
```

Use o Node de `.nvmrc`. `web:check` inclui lint, typecheck, Vitest e build e integra `release:check`. A suíte Chromium do console é separada da suíte OAuth e usa processo de teste em memória com `FakePlugServer`, sem banco operacional, ERP ou credenciais reais. Falhas, barreiras de concorrência e dados de visualização usam fixtures sintéticas. CI instala dependências do frontend e executa o console em Linux e Windows.

O navegador verifica salvar/validar, salvamento recusado, exclusão/cancelamento/foco, preview obsoleto, candidata versus novo exemplo, governança, skill no grafo, JOIN composto, clique duplo, resposta antiga e emissão real por setup sintético. Telas são capturadas nos dois temas em 390/768/1440 px; telas principais também são verificadas em 320 px e zoom 200%. Testes visuais não substituem HTTP, CAS, isolamento e gates de segurança. Suítes PostgreSQL/Redis/OAuth exigem seus ambientes de teste próprios.

Contrato do cofre: [vault-and-mcp-token.md](../auth/vault-and-mcp-token.md). Tools: [tools.md](../mcp/tools.md). Curadoria: [training.md](../product/training.md).
