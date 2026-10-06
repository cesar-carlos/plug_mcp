# Se7e para ChatGPT

Esta pasta é o fonte do pacote, sem credenciais e sem identificador de conexão inventado. Duas skills orientam consulta e treinamento/administração; somente o pacote publicado no servidor autoriza dados.

1. Implantar `/mcp/chatgpt` em HTTPS e configurar o piloto conforme [contrato OAuth](../../docs/auth/chatgpt-oauth.md).
2. No ChatGPT Plugins, adicionar servidor MCP customizado e criar conexão privada. Copiar o identificador técnico real `plugin_asdk_app...` e conferir CIMD/redirects apresentados.
3. Executar `npm run plugin:package -- --connection-id=ID_REAL`, com PUBLIC_BASE_URL do mesmo ambiente. Variante portátil: `npm run plugin:package -- --portable`.
4. Instalar o artefato gerado em marketplace local compatível com a superfície utilizada e testar em conversa nova. Depois, distribuir privadamente no workspace.
5. Informar token MCP apenas no formulário externo, conferir persona e consentir. Usar get_profile e obter_contexto_sessao antes do trabalho.

Cada artefato nasce em diretório novo sob build/. A variante ChatGPT referencia a conexão registrada em `.app.json`; a portátil contém mcp.json HTTP. Não combinar ambos para registrar o servidor duas vezes. Não copiar tokens para manifests, skills ou conversa.

Homologação real exige URL HTTPS, administração do workspace e identificadores reais. Testes locais não atestam instalação ChatGPT. O plugin não inclui painel visual.

Antes da montagem, executar `npm run chatgpt:check -- --stage=prepare`. Antes da instalação, executar `npm run chatgpt:check -- --stage=pilot --package=plugins/se7e-chatgpt/build/chatgpt --connection-id=ID_REAL`; `--json` produz relatório sem credenciais. `se7e-package.json` registra variante, versão, recurso, URL pública e conexão usados na montagem; o verificador recusa outro ambiente e registro duplicado. Saída 0 aprova verificações automáticas, 1 indica falha e 2 indica argumentos/entradas ausentes. A correspondência real entre a conexão registrada no ChatGPT e seu servidor ainda precisa ser conferida na homologação.
