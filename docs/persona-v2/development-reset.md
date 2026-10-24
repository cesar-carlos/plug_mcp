# Reset de dados em desenvolvimento

Comando separado: `npm run db:reset:persona-v2:dev`. Não é chamado por startup,
worker, console ou MCP. Não carrega `.env` e não usa `DATABASE_URL` como fallback.
Não faz chamadas ao hub/agente nem altera suas bases ou as bases de negócio.

## Alvo permitido

- `NODE_ENV` explicitamente `development` ou `test`.
- URL PostgreSQL explícita em `PERSONA_V2_RESET_DATABASE_URL`, somente loopback,
  sem parâmetros de conexão adicionais. Não usar túneis para ambientes remotos.
- Banco dedicado com nome `persona_v2_<identificador>_dev` ou
  `persona_v2_<identificador>_test`, até 63 caracteres.
- `--generation=persona-v2` e `--confirm-database=<nome exato>` obrigatórios.
- Todas as migrations atuais, com checksums íntegros, e somente as tabelas
  conhecidas do controle v2. Legado, tabelas/views estrangeiras ou outros schemas
  contendo relações são recusados antes de apagar dados.
  O prefixo interno é literalmente `pg_`; nomes de usuário como `pgx` continuam
  sujeitos à recusa, sem exceção por semelhança textual.
- Marcação prévia pelo operador no provisionamento do banco descartável:
  `COMMENT ON DATABASE persona_v2_manual_dev IS 'se7e:persona-v2:disposable-development';`.
  O comando de reset nunca acrescenta essa marca automaticamente.

A marca é uma declaração do operador, não uma descoberta do ambiente. Não marcar
bancos operacionais como descartáveis. Segredos da conexão ficam no ambiente do
processo; não colocar a URL em argumentos, documentação, histórico ou logs.

## Procedimento

1. Parar servidor, workers, runners e outras conexões do banco descartável.
2. Definir as variáveis acima para o alvo de desenvolvimento previamente criado.
3. Simular: `npm run db:reset:persona-v2:dev -- --generation=persona-v2 --confirm-database=persona_v2_manual_dev`.
4. Conferir nome, modo e número de tabelas retornados. Nenhum conteúdo é exibido.
5. Para apagar os dados, repetir os mesmos argumentos com `--apply` explícito.

Sem `--apply`, somente simula. `--simulate` pode ser explícito; modos conflitantes,
argumentos desconhecidos ou repetidos são recusados. Cada execução reconfere o
alvo. A simulação não reserva autorização para a aplicação seguinte.

## Efeito e concorrência

O reset trunca os dados de todas as tabelas v2 em uma transação, preservando a
geração e o histórico de migrations. Não remove o banco, schema, roles, grants ou
funções; não cria cadastros nem reaplica migrations automaticamente. Cadastros,
treinamento, publicações, tokens, OAuth, anexos e registros de operações de teste
são apagados. Isso só é permitido no banco explicitamente descartável.

Usa o lock de migrations e locks exclusivos das tabelas, com prazos limitados.
Conexões observadas, lock disputado, schema/checksum divergente ou dependência
inesperada recusam a operação. `TRUNCATE ... RESTRICT` não propaga limpeza para
recursos desconhecidos. Falha antes do commit provoca rollback. A aplicação deve
permanecer parada; o comando não impede um operador de reconectá-la depois.

Resposta perdida exige conferir o banco; não presumir que houve rollback nem
reenviar automaticamente. Reset não desfaz efeitos em bases externas, não limpa
journals do agente e não serve como procedimento de produção ou conciliação.
Para o corte, permanece obrigatório um banco MCP vazio/dedicado conforme o
[plano restante](remaining-plan.md).
