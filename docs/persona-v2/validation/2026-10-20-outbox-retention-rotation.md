# Rotação concorrente com retenção da outbox — 2026-10-20

Teste PostgreSQL 17 com conexões independentes, operador de cofre, lock de sessão,
transações, cifras e retomada reais. Somente bancos próprios aleatórios.

O teste bloqueia as linhas pela API real de scan da rotação. Enquanto esse lock
está ativo, outra conexão executa o worker de limpeza: a linha vencida é ignorada
por SKIP LOCKED, sem espera nem remoção. A rotação troca a chave e confirma.
Depois, a limpeza remove a cifra vencida. Rewrap com a imagem anterior da linha
é recusado por CAS, sem restaurar o segredo. Retomada explícita da rotação conclui;
pendente conserva estado e segredo decifrável com a nova chave.

Oito testes em três arquivos passaram em 3,03 segundos, início 10:48:16,
incluindo upgrade e limpeza. Fixture removida. Tipos, lint dirigido e formatação
passaram. Sem modificação adicional do runtime ou migrations nesta rodada.

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
SHA-256 de outbox-retention-rotation.postgres.test.ts:
B842676D8DF3F3F3D595D5050B27C1B14DFD38B9337E9B82D788A2A8D688E6F2.

## Regressão ampliada e correções da fixture

A rodada completa iniciou 10:48:46 e terminou em 191,36 s: 323 testes passaram,
um falhou e houve uma exceção não tratada. Não é rodada aprovada.
O baseline esperava somente quarenta migrations; atualizado para listar
explicitamente 0041/0042, sem reduzir a asserção. A limpeza de composição
estrutural usava DROP WITH FORCE após pool.end e encerrou uma conexão ainda
finalizando; agora DROP normal aguarda o fechamento e expõe eventual vazamento,
sem matar cliente ou suprimir erros.

Reexecução dos dois arquivos afetados: 27 testes passaram em 11,83 s,
início 10:52:43, sem erro não tratado. Fixture removida. Lint e formatação
passaram. A rodada completa posterior ainda está pendente; não somar esses
27 aos 323 como se constituíssem uma única rodada integral aprovada.

## Limites do aceite

Não certifica OOM, carga prolongada, sinais de supervisor instalado ou todas
as ordens de falha. Não utiliza receptor externo nem executa negócio.
Não é avaliação da IA ou teste manual de treinamento.
HTTPS/ChatGPT manuais e deploy bloqueado; nenhum gate foi encerrado.
