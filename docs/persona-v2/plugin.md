# Pacotes privados Se7e

Contrato do perfil local **se7e-package-v1**. O pacote orienta o consumidor;
somente o servidor autoriza ferramentas e dados. Não instala, publica ou altera
conexões existentes. O [deploy de teste v2](first-test-deploy.md) está autorizado
por DV2-017; isso não comprova conexão ChatGPT nem libera o aceite integral.

## Gerações e variantes

| Geração      | Fonte                     | Portátil                                   | ChatGPT                                   |
| ------------ | ------------------------- | ------------------------------------------ | ----------------------------------------- |
| `legacy`     | `plugins/se7e-chatgpt`    | `/mcp/chatgpt`, OAuth legado               | `.app.json` com ID real da conexão legada |
| `persona-v2` | `plugins/se7e-persona-v2` | `/mcp`, Bearer manual informado no cliente | `.app.json`, ID real da conexão OAuth v2  |

O candidato v2 usa contexto da persona, fontes concedidas, diagnóstico local,
consulta, cruzamento e operações efetivamente disponíveis. Treinamento e
publicação têm ferramentas delegadas condicionadas à descoberta, permissões,
consentimento e teto do hub. A skill orienta rascunhos, casos/relatórios, template
exato e revisão/publicação. Prazo humano fica no console e runners são separados;
publicar não aprova lançamentos. Gestão editorial geral e homologação continuam
no [plano restante](remaining-plan.md). Não há captura automática de consultas.
O pacote legado conserva seus contratos próprios.

## Montagem e verificação

Selecionar explicitamente geração, ambiente HTTPS e variante. Para um candidato
portátil v2, apontar ao ambiente isolado de homologação:

```sh
npm run plugin:package -- --runtime=persona-v2 --portable --public-base-url=https://homologacao.example.test --output=plugins/se7e-persona-v2/build/rodada-nova
npm run plugin:check -- --runtime=persona-v2 --portable --public-base-url=https://homologacao.example.test --package=plugins/se7e-persona-v2/build/rodada-nova/persona-v2/portable/se7e
```

O domínio acima é ilustrativo; não comprova ambiente provisionado. Substituir
pelo endpoint autorizado. O Bearer não é argumento nem arquivo do pacote.
Configurar autenticação somente na interface segura do cliente.

Legado ChatGPT exige `--runtime=legacy --connection-id=ID_REAL`, sem `--portable`.
O ID deve ser o identificador do aplicativo da conexão privada existente,
com prefixo `asdk_app_`, `connector_` ou `templated_apps_`, seguido por letra ou
dígito e depois somente letras, dígitos, `_` ou `-`. IDs de plugin
(`plugin_asdk_app_`), URLs e nomes de exibição são recusados. Não converter
prefixos automaticamente; copiar o ID real da descoberta. Essa regra vale para
as duas gerações. A validação sintática não comprova existência remota. `PUBLIC_BASE_URL`
pode substituir o argumento de URL. `plugin:check` não carrega `.env`, não faz
rede e não escreve no pacote. O código de saída é 0 para aprovação local e 1
para recusa; erros não imprimem arquivos, credenciais ou entradas recebidas.

Destino final: `<output>/<geração>/<variante>/se7e`. Destinos existentes são
recusados, inclusive em montagem concorrente. Um lease serializa a montagem;
staging privada é validada antes de disponibilizar o diretório final. Não remover
um lease abandonado sem verificar que o processo anterior terminou. O comando
não cria ZIP, instala, registra conexão ou distribui o artefato.

## Perfil validado

A skill de consulta v2 orienta anexos JSON/binários somente quando publicados e
concedidos; catálogo mínimo inclui criar_anexo_consulta/obter_anexo. Binário exige
coluna física, metadados positivos e um registro completo, sem conversão ou
recriação automática. [Contrato](attachments.md). Não altera instalações ou IDs;
validação local do pacote não certifica download no ChatGPT real.

Schemas locais fixados em [manifesto](../../contracts/plugins/se7e-manifest-v1.schema.json),
[skill](../../contracts/plugins/se7e-skill-v1.schema.json) e
[inventário](../../contracts/plugins/se7e-record-v1.schema.json).
São o subconjunto Se7e suportado do formato Agent Plugins 1.0.0; não afirmam
suportar todas as extensões upstream. Testes verificam a igualdade entre esses
schemas e o validador executado. Montagem e verificação não baixam schemas.

O validador exige:

- Identidade `se7e`, versão SemVer, descrição curta de até 30 caracteres.
- Duas skills com pasta/nome iguais, frontmatter YAML válido, descrição, corpo e
  geração explícitos. Tools declaradas e citadas em código inline devem coincidir
  com o catálogo mínimo da geração. Testes de `tools/list` conferem esse catálogo
  com o runtime; o catálogo não é concessão nem substitui descoberta autenticada.
- Referências Markdown internas existentes e contidas, caminhos relativos sem
  `..`, URL externa somente HTTPS sem usuário/senha. Não há acesso à rede para
  conferir conteúdo externo. Referências por rótulo e HTML não são interpretadas
  como dependências deste perfil; não utilizá-las para incluir arquivos.
- Ausência de links simbólicos, arquivos de ambiente, chaves, logs, caminhos
  externos, formatos desconhecidos e registros MCP duplicados. Há limites de
  arquivos, profundidade e bytes. Detecção de possíveis segredos é conservadora;
  não prova a ausência de qualquer texto confidencial arbitrário.
- Correspondência exata entre geração, versão, endpoint, variante, ambiente e ID
  da conexão; `.app.json` somente ChatGPT e `mcp.json` somente portátil.
- Inventário completo de arquivos e SHA-256, incluindo catálogo e assets.
  `se7e-package.json` não inclui o próprio hash. Hashes detectam divergência;
  não constituem assinatura de autoria ou comprovação da conexão remota.

## Identidade oficial

Usar os PNGs normais `web/public/icon-192.png` e `icon-512.png`, já incorporados
do material oficial `D:\Developer\Data7\Expedicao\Icon Kitchen`. A montagem copia
esses arquivos para `assets/se7e-192.png` e `assets/se7e-512.png`; valida seus hashes
fixados no projeto. Não usa versões maskable, não recolore nem recorta o símbolo.
Logo e ícone viajam dentro do artefato; não há dependência da pasta externa.
O [console](console.md) documenta os demais assets da interface.

## OAuth v2 e aceite pendente

O contrato aprovado exige `/mcp/chatgpt` v2 separado, scope `se7e:persona`,
`get_profile` com identidade opaca estável e revogação somente da conexão atual.
Audience/resource são o endpoint configurado; cliente/redirects exatos, PKCE
S256, códigos de uso único e refresh rotativo com detecção de replay.
Transação de 15 minutos, código de 60 segundos, access de 15 minutos e concessão
de até 30 dias, limitada pelo token originador. Alterações desse token invalidam
conservadoramente derivados; ampliações não são herdadas. Não persistir senha ou
JWT do responsável. Implementado na composição v2, habilitado explicitamente com
allowlist própria, consentimento explícito, stores cifrados e locks v2.
[Configuração, endpoints e limites](oauth.md). Setups de cadastro e rotação da
credencial de fonte exigem gerenciar_fontes, delegação vigente do hub e
consentimento explícito. Tools são condicionais; não assumir sua presença sem
descoberta. Segredos e reautenticação do responsável ficam no navegador.
O setup `iniciar_rotacao_token_persona` exige gerenciar_tokens consentido e
delegação vigente; devolve somente link, com confirmação humana e segredo novo
exclusivo do navegador. `iniciar_emissao_token_persona` propõe concessões e prazo
limitados para confirmação no navegador; nunca recebe/devolve Bearer. As tools
condicionais `iniciar_cadastro_integracao` e `iniciar_rotacao_credenciais_integracao`
exigem gerenciar_integracoes, consentimento e delegação; credenciais entram só no
navegador. Não ativam integração ou operações nem fazem chamadas externas.
O catálogo mínimo ChatGPT inclui
`get_profile` e `revogar_conexao_chatgpt`; o portátil permanece manual.

Montagem ChatGPT v2: usar os comandos existentes com `--runtime=persona-v2`,
sem `--portable`, passando `--connection-id=ID_REAL` da conexão privada de
homologação e o endpoint HTTPS correspondente. A montagem não verifica
remotamente esse ID nem cria/atualiza uma conexão; a instalação é evidência separada.

O validador local não comprova instalação privada ou conversa no ChatGPT.

O pacote candidato v2 orienta consultas REST/MCP e ações externas publicadas:
preparar, encaminhar para aprovação no console, executar o fingerprint vigente e
acompanhar o journal. Desconhecido nunca autoriza retry e cancelamento só precede
o envio. `conciliar_acao_externa` consulta somente a leitura treinada publicada,
com a chave original; evidência separada não altera receipt ou permite reenvio.
Catálogo offline e metadata das skills refletem as tools disponíveis;
não alteram ID, endpoint ou conexão instalada. [Contrato externo](external-integrations.md).
O [procedimento HTTPS/manual v2](oauth.md#homologação-https-e-conexão-manual)
inclui `persona:https-check`: discovery e pacote/CIMD são verificações separadas
da conexão efetiva. Não usar `chatgpt:check` legado para certificar a v2 nem
reapontar uma conexão operacional apenas porque seu ID foi localizado.
Essas evidências integram `oauth-and-console` e `coordinated-cutover` na
[matriz](acceptance.md). Os testes técnicos exigem ambiente isolado, descoberta
autorizada, consulta publicada e cenários de OAuth/revogação. Instalação/conversa
manual no cliente está dispensada por DV2-015; nenhum identificador
sintético de teste poderá ser distribuído como conexão real.
