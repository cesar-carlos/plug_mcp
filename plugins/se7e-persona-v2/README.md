# Se7e — candidato persona-v2 privado

O pacote gerado inclui guia compartilhado com o runtime e `compatibility.json`.
Compare com a resposta decodificada de `obter_capacidades` usando
`npm run plugin:compare -- --package=CAMINHO --capabilities=capacidades.json`.
Isso verifica contratos, não a versão instalada no ChatGPT. Procedimento e
limites no [contrato do plugin](../../docs/persona-v2/plugin.md) e no
[roteiro sintético](../../docs/persona-v2/plugin-client-validation.md).


Fonte separada do legado. Usa contexto da persona, múltiplas fontes concedidas,
diagnóstico, skills publicadas, consultas, cruzamentos e operações autorizadas.
Treinamento/publicação possuem tools v2 condicionais, com permissão, consentimento
OAuth e delegação vigente. Prazo humano de revisão fica no console; runners de
testes são separados e publicação não aprova lançamentos. Nenhuma consulta é
capturada automaticamente como treinamento.

Cadastro de fonte e rotação de credenciais podem iniciar pelas tools condicionais
`iniciar_cadastro_fonte` e `iniciar_rotacao_credenciais_fonte`, com gerenciar_fontes,
delegação vigente no hub e consentimento quando OAuth. O responsável preenche o
setup temporário no navegador; nunca envie segredos no chat ou em tools.

```sh
npm run plugin:package -- --runtime=persona-v2 --portable --public-base-url=https://homologacao.example.test --output=plugins/se7e-persona-v2/build/rodada-nova
npm run plugin:check -- --runtime=persona-v2 --portable --public-base-url=https://homologacao.example.test --package=plugins/se7e-persona-v2/build/rodada-nova/persona-v2/portable/se7e
```

Substituir o domínio ilustrativo por homologação autorizada. Bearer manual é
informado somente na interface segura do cliente; nunca no pacote ou conversa.
O artefato é autocontido e não depende da pasta externa de identidade visual.

ChatGPT v2 usa OAuth próprio em `/mcp/chatgpt`, scope `se7e:persona` e
consentimento explícito por fonte/skill/operação. Para montar essa variante,
omita `--portable` e informe `--connection-id=ID_REAL` da conexão privada
do ambiente escolhido. O ID deve ser do aplicativo (`asdk_app_`, `connector_`
ou `templated_apps_`), obtido da conexão real; não use ID de plugin nem converta
prefixos. Habilite OAuth e configure CIMD/redirect exatos conforme o
[contrato OAuth](../../docs/persona-v2/oauth.md).
Nenhum token entra no pacote. A montagem não instala nem distribui o pacote;
instalação real e aceite integral continuam pendentes. O deploy de teste v2 está
autorizado por DV2-017, separado do aceite integral. Montagem não habilita OAuth.
[Contrato e aceite pendente](../../docs/persona-v2/plugin.md).
