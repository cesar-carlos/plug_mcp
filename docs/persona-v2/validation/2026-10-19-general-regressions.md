# Regressões gerais do candidato — 2026-10-19

## Escopo

Rodada do checkout atual, base MCP 136b5bfc8f7104b753bbd3703c9ffda196fdd51f com
alterações locais. Não é aceite de produção ou certificação automática da imagem
construída em rodada anterior. Nenhum contrato público do hub foi alterado.

## Resultados concluídos

- Suíte geral: 168 arquivos aprovados, seis omitidos; 1.552 testes aprovados e
  91 omitidos, em 93,94 segundos. Omissões condicionais de infraestrutura não
  contam como aprovação; cenários legados de banco permanecem fora desta rodada.
- Integração persona-v2: 19 arquivos, 308 testes aprovados, sem omissões, em
  197,44 segundos, com PostgreSQL 17 Alpine e Redis descartáveis.
- Cache/singleflight Redis: oito testes aprovados, em 985 milissegundos.
- Frontend: 20 arquivos e 73 testes aprovados; lint, tipos e build passaram.
- Node 24.21.0, TypeScript 7.0.2, lint geral, tipos/build backend e docs:check passaram.
- training:check passou com hub fixado em 76950497dc386130e13b7d6afc0678e50208e985,
  sem modificar checkout/index/contrato do hub.
- format:check inicialmente apontou três inventários JSON históricos. Foi alterada
  somente a apresentação; comparação dos objetos antes/depois comprovou valores
  e hashes preservados. O check global passou depois da correção.

O build frontend mantém avisos não fatais sobre annotations da dependência Zod.
As verificações próprias PostgreSQL e Redis não certificam os três motores nem
substituem o harness persistente com hub/agente instalados.

## Limites

As 91 omissões da suíte geral permanecem explícitas, mesmo com a suíte v2 separada
aprovada. Nenhum resultado sintético é avaliação da IA. HTTPS e ChatGPT continuam
manuais; regressão instalada nos três motores e aceite integral permanecem
pendentes. ready:false e todos os gates abertos. Sem publicação, push ou deploy.

## Console e limpeza

As 46 jornadas Chromium passaram em 4,4 minutos, sem filtro ou omissões. Incluem
criação/treinamento/consulta de duas fontes, integrações, conhecimento, tokens,
edição protegida, anexos, operações e cruzamentos. PostgreSQL real de fixture e
hub sintético; não equivalem à cadeia instalada MCP → hub → agente nos três
motores. Servidor/worker do harness encerraram normalmente. Contêineres PostgreSQL
e Redis e volumes próprios foram removidos após conferir IDs/rótulos. Sem bancos,
caches, DSNs ou cofres operacionais.

Inventário final de 1.059 arquivos, após atualização do índice/plano documental:
sourceSha256 d6e058976e565ed0d27157bc6447a2743677114fbf5b170d973f2d59e64e5f3a.
Código permaneceu o mesmo durante as suítes; alterações posteriores nesta rodada
foram documentais e verificadas por docs:check. Captura não autoriza liberação.
