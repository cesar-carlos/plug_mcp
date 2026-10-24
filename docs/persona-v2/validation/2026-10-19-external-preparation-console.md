# Preparação externa pelo console — 2026-10-19

## Entrega

Formulário em Integrações descobre ações concedidas com Bearer, confirma a persona
e apresenta campos tipados do snapshot publicado. Confirmação explícita registra
somente preparação. Alteração dos campos invalida confirmação; aprovação humana
e execução permanecem separadas. Contexto alterado descarta dados/respostas e
tentativa enviada não é repetida após confirmação perdida.

`preparar_acao_externa` aceita `expectedPublicationId` opcional; o formulário o
envia sempre. Divergência é recusada dentro da transação antes de criar operação.
Nenhum contrato público do hub foi alterado. Migrações e concessões preservadas.

## Verificação

- Quinze testes frontend aprovados em preparação, estado de operação e valores.
  Incluem outra persona, resposta atrasada e perda de confirmação sem reenvio.
- PostgreSQL dirigido: um cenário aprovado, 67 fora do filtro, com publicação
  divergente recusada, MCP com publicação exata e separação preparação/aprovação.
- Chromium final: um cenário aprovado em 390 px, 49,1 segundos. Persona e contrato
  de fixture, Bearer, campos, confirmação invalidada após edição, preparação
  persistida com publicação esperada, aprovação pendente e claimed_at nulo.
- Tipos backend/frontend, lint dirigido/backend e frontend, builds e
  training:check aprovados. O último exigiu leitura autorizada do hub porque o
  sandbox recusou propriedade Git; nenhuma configuração Git foi alterada.

A primeira rodada Chromium falhou na localização do seletor. Foi corrigida a
identificação acessível e a rodada passou; o teste final acrescentou a confirmação
após alteração de campo. Os servidores de fixture ficaram vivos após o término
dos workers Chromium no Windows; foram encerrados somente após conferir PID e
linha de comando. Os dois contêineres PostgreSQL e volumes exclusivos foram
removidos por ID/label conferidos. Não certifica encerramento instalado.

## Limites

Hub/provedor são sintéticos nesta prova de UI/PostgreSQL; não comprova HTTPS
público, ChatGPT, provedor real ou acessibilidade integral. Nenhum lançamento em
fonte do usuário. Preparação SQL visual e aceite operacional continuam pendentes.
Manifesto ready:false, sem gates encerrados ou deploy.

[Inventário dos arquivos funcionais](2026-10-19-external-preparation-console-files.json).
