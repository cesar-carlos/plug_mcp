# Recuperação do seletor editorial — 2026-10-26

Checkout local sobre `f521585d40e9a844984b143101b928676614d519`, com mudanças
acumuladas ainda sem commit. Windows, Node 24.21.0. Sem deploy nesta rodada.

## Mudança verificada

O seletor compartilhado de datasets SQL/cruzamento usa geração de contexto para
descartar sucesso e falha atrasados, inclusive na sequência seleção A → B → A.
Trocar seleção limpa prévia/erro, preservando sementes aplicadas. Desmontagem
ignora entrega tardia e libera bloqueio. Não há retry ou salvamento automático,
nem promessa de cancelamento da requisição já enviada.

## Evidência

- Testes do console: 94 aprovados em 24 arquivos. Sete cenários novos exercitam
  resposta antiga após retorno ao contexto, falha tardia sem sobrescrever erro
  atual, invalidação imediata, recuperação explícita, desmontagem com sucesso e
  falha, e recusa de leituras duplicadas/desabilitadas.
- Navegador: 24 cenários aprovados pela suíte `test:persona-v2:ui`, incluindo
  seleção de versões SQL e datasets independentes por fonte de cruzamento.
  APIs simuladas; não comprovam persistência ou consultas nos motores.
- Build do console, tipos, lint e checagem documental executados na rodada.

A primeira execução limitada teve falhas de leitura dos arquivos temporários do
Vitest (ENOENT). A rodada completa com acesso aos temporários passou, sem skips
ou relaxamento dos testes. O helper de teste foi ajustado à biblioteca TypeScript
vigente do console; não foi necessário mudar o alvo do compilador.

## Limites

Sem alteração de contrato HTTP, schemas, autoridade ou instruções MCP. Sem nova
rodada PostgreSQL, cadeia dos três motores, instalação ChatGPT ou certificação
do servidor remoto. Importação direta e fusão de datasets continuam no plano;
nenhum gate integral de clientes foi aprovado.
