# Regressão geral com infraestrutura — 2026-10-19

Checkout baseado em `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
Esta rodada complementa as regressões gerais anteriores; não certifica a imagem
nem encerra gates persona-v2. Nenhum código funcional foi alterado nesta rodada.

## Ambiente e resultados

Node 24.21.0, Vitest 5.0.3, PostgreSQL de fixture
`pgvector/pgvector:pg16` e Redis `7-alpine`, expostos somente em loopback.
Banco dedicado `se7e_regression_20261019_ci`, separado de todos os bancos v2,
hub, agentes e negócio. O runner legado usa SQL de fixture; isso não constitui
homologação de SQL pela cadeia persona-v2.

- `npm test`: 174 arquivos e 1.643 testes aprovados, sem omissões, em 89,55 s.
  A rodada cobre os 91 testes omitidos na execução anterior sem infraestrutura.
- Suíte dirigida de oito arquivos: 196 testes aprovados, sem omissões, em 7,68 s.
- `npm run test:migrations`: aprovado, incluindo baseline, upgrades e
  verificações PostgreSQL de OAuth, concorrência, rollback multirrepositório e
  corridas de publicação, remoção e rotação.

## Tentativas corrigidas

A primeira execução dirigida passou em 195 testes e recusou o runner pelo nome
de banco fora do padrão seguro `se7e_*ci`. A segunda apontou banco inexistente:
o verificador de migrations já havia removido seus próprios bancos temporários.
Foi criado e migrado um banco exclusivo com nome aceito; a rodada dirigida e a
suíte completa passaram depois disso. Nenhuma proteção foi relaxada.

## Limites e limpeza

Os testes de referência não são avaliação da IA. Esta suíte geral exclui as
suítes específicas persona-v2, homologação e live; seus resultados permanecem
separados. Não houve conexão com fontes do usuário ou mudança no contrato do hub.

Os dois contêineres e seus volumes anônimos foram removidos após conferência
dos IDs completos e do rótulo exclusivo `se7e.fixture=legacy-regression-20261019`.
HTTPS e ChatGPT continuam manuais. Deploy bloqueado, `ready: false`, sem gate
encerrado, commit, push ou publicação de imagem.
