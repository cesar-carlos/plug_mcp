# Leitura editorial delegada de template — 2026-10-19

## Entrega

`obter_template_treinamento` e POST de consumidor `administration/templates/ler`
permitem ler referência exata antes de importar. Reutilizam autoridade de
treinamento, teto do hub, consentimento OAuth, fonte ativa/versão/dialeto e papel
editorial no catálogo. O catálogo permanece protegido pelo lock de leitura da
transação; a autoridade local é revalidada antes de concluir.

Resposta contém estrutura declarada e variantes do dialeto escolhido, com
`executable: false` e hash do original. Não lista biblioteca, devolve datasets,
publica, cria rascunho ou executa SQL. [Contrato](../knowledge-library.md).
Sem migration, mudança de contratos públicos do hub ou alteração do pacote legado.

## Verificações

- Duas suítes PostgreSQL: 90 testes aprovados, sem omissões, em 44,82 segundos.
- Leitura por MCP e HTTP Bearer, hash/versão errados, fonte/dialeto incompatíveis,
  outra persona, catálogo ausente e tentativa de ler dataset recusados.
- Serviço OAuth exige consentimento de treinamento e fonte; revogação da
  concessão ou remoção do membro bloqueiam leitura. Não é homologação ChatGPT.
- Variantes retornadas limitadas ao dialeto; cifras e linhas de dataset ausentes.
- Tipos, lint dirigido e build passaram. `training:check` passou com referência
  do hub `76950497dc386130e13b7d6afc0678e50208e985`, sem alterar Git ou contrato.
  A primeira tentativa restrita encontrou a proteção de proprietário Git do
  sandbox; a conferência autorizada resolveu o ambiente, sem exceção global.

A primeira rodada teve 69 aprovações e uma expectativa HTTP incorreta: a fixture
representa revogação remota por erro de autoridade indisponível (503), não por
resposta negativa autenticada (403). A expectativa foi corrigida; o bloqueio de
leitura permaneceu. A rodada final inclui também regressões da biblioteca.

## Identificação e limites

Node 24.21.0, PostgreSQL 17 Alpine isolado, base MCP
`136b5bfc8f7104b753bbd3703c9ffda196fdd51f` com alterações locais. SHA-256:

- Catálogo: `35525898ceb7525f650faf587abfa326a0b35f1f983b3d542a6a8fe99d172d2f`.
- Schema: `0691677023b95cd040d25e7686cf48a312fb8425a35332fda63732db601d8a50`.
- Testes: `ad50a7cf44d9950e70f84faba8d610ae4934d29f6ea6e65784fb0ab3821de6af`.

Bancos das suítes removidos pelos testes; contêiner e volume de fixture removidos
após conferência de ID/rótulo. Nenhuma fonte operacional foi utilizada.
Não encerra gestão editorial delegada geral, integração com runners, três motores,
HTTPS/ChatGPT manuais ou aceite instalado. Todos os gates permanecem abertos,
`ready: false`, sem publicação, commit, push ou deploy.
