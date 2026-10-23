# Preparação SQL no console — 2026-10-19

## Resultado e alcance

Um cenário Chromium dirigido passou em 9,3 segundos na rodada final, em viewport
390 × 844. A primeira rodada passou em 12,2 segundos; a final acrescentou
asserções explícitas das ferramentas chamadas. Não houve execução da suíte
integral. Os 19 testes unitários dirigidos da preparação SQL/externa e acompanhamento,
tipos frontend, lint frontend e build passaram no bloco de implementação anterior.
Nesta rodada passaram tipos backend e lint do teste alterado.

O cenário usa PostgreSQL real de controle e runner isolado, com hub sintético:

- Cria persona e fonte de fixture, edita contrato SQL e caso obrigatório.
- Executa o runner separado em banco descartável, revisa e publica pelo console.
- Edita rascunho sem alterar o nome da publicação ativa; confere conflito CAS.
- Emite token restrito à fonte, skill e capacidades publicadas.
- Carrega o formulário concedido com nome da publicação, nunca do rascunho.
- Parâmetro não nulo não oferece seleção de NULL; edição invalida confirmação.
- Cria uma preparação, aguardando aprovação humana separada.
- Confere uma única chamada preparar_operacao e ausência de executar_operacao,
  cancelar_operacao e conciliar_operacao nesse percurso.
- Limpar o Bearer remove a preparação da tela.

## Candidato e ambiente

Base MCP `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
[Hashes dos arquivos funcionais](2026-10-19-sql-preparation-console-files.json).
Node 24.21.0 pelo wrapper do projeto; TypeScript 7.0.2 no backend.
PostgreSQL 17 Alpine em contêiner dedicado, porta loopback dinâmica; nenhuma
credencial ou fonte operacional. Chromium pelo Playwright do projeto.

O servidor de fixture e o worker Playwright encerraram normalmente nas duas
rodadas. Contêiner e volume foram removidos após verificar ID e rótulo próprios.
O runner removeu seu banco descartável no finally. Nenhuma imagem foi publicada.

## Limites

Não certifica hub/agente instalados, DML nos três motores, SQL adaptável visual,
perda de confirmação no navegador, acessibilidade integral, HTTPS, ChatGPT ou IA.
SQL adaptável e perda de resposta têm testes unitários, sem equivalência à
homologação visual/operacional. Contratos públicos do hub não foram alterados.
HTTPS/ChatGPT continuam manuais; ready:false e os 13 gates permanecem abertos.
