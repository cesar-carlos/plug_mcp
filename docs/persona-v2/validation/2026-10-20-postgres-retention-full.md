# Regressão PostgreSQL após retenção — 2026-10-20

Suíte completa vitest.persona-v2.config.ts, sem filtro:
**324 testes aprovados em 21 arquivos**, sem omissões ou erros não tratados.
Início 10:54:01, duração 185,23 s.

PostgreSQL 17 em contêiner próprio com nome aleatório, porta loopback e senha
efêmera; cada arquivo cria seus bancos dedicados. Não utiliza fontes do usuário.
Contêiner/volume da fixture removidos; variável de conexão anterior restaurada.

Inclui migrations 0041/0042, upgrade da retenção, limpeza concorrente com rotação,
baseline exato de 42 migrations e os demais fluxos PostgreSQL da suíte.
A rodada anterior com falha de inventário e erro na limpeza não foi sobrescrita.
Após atualizar a lista esperada e retirar DROP WITH FORCE da fixture estrutural,
esta rodada passou integralmente.

MCP base 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com alterações locais.
SHA-256 dos arquivos corrigidos:

- postgres.test.ts: 7288F971B078F24AEB614BFD5A375D1D78DC5652B7F106FABD8B2D6DE0CBA035.
- structure-composition.postgres.test.ts: C3FA1B7AE38DD8CA6C69656A9B390A38CEBBBB089876FA3FCCFC7022B001E77A.

## Limites

Suíte do controle PostgreSQL com autoridades/provedores de fixture e alguns
processos reais próprios. Não equivale à cadeia dos três motores, imagem final,
desktop instalado, HTTPS/ChatGPT, leitor de tela ou avaliação da IA.
Não fecha gates ou autoriza deploy. Manifesto ready:false preservado.
