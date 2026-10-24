# Inspeção sem submissão duplicada — 2026-10-22

Rodada de desenvolvimento para remover um impedimento concreto do treinamento
manual. Não constitui aceite instalado, liberação de produção ou avaliação da IA.

## Revisão e ambiente

- MCP base: `136b5bfc8f7104b753bbd3703c9ffda196fdd51f`, com alterações locais.
- Node 24.21.0 pelo wrapper do projeto; Chromium pelo Playwright.
- PostgreSQL de controle e dados sintéticos em contêineres exclusivos criados
  da imagem local `postgres:16-alpine`, com nomes aleatórios, porta loopback,
  senha efêmera e remoção de contêiner/volume no final de cada rodada.
- Hub e autenticação sintéticos do helper de navegador; persistência e SELECT
  reais no PostgreSQL dedicado. Não é a cadeia MCP/hub/agente dos três motores.
- Nenhum instalador, serviço operacional, fonte do usuário ou imagem publicada.

Hashes SHA-256 dos arquivos de código verificados:

| Arquivo                                        | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `web/src/persona-v2/SourceInspectionPanel.vue` | `79bf3b3f05ab48f67ff0e12e5e3fdc7394b6c82e39af54e3a0979c71f5238c42` |
| `tests/persona-v2-browser/persona.spec.ts`     | `ff91ba24d32a02d768aeba2505b7780b8ff6d367dd639cd31e09d4ab87ceff41` |

## Defeito, correção e testes

Antes da correção, dois eventos submit despachados na mesma tarefa JavaScript
enviaram duas requisições de inspeção: o teste esperava uma e recebeu duas.
O bloqueio era ativado somente depois de uma espera assíncrona.

O bloqueio agora é síncrono e precede a primeira espera. Após a atualização
reativa, o painel reconfere permanência, escopo e endereço do vínculo antes
do envio. Fontes inativas não iniciam inspeção/composição. Servidor e guardas
de respostas continuam responsáveis pela autorização e pelo descarte tardio.

Resultados após a correção:

- Dois cenários Chromium aprovados: submissão duplicada envia uma única
  requisição; paginação/composição explícita e descarte ao alterar escopo.
- Quatro cenários Chromium de regressão aprovados: adoção de perfil físico;
  persona com duas bases, treinamento/publicação e consulta; erro de treinamento
  preservando edição/foco; nome publicado preservado e revogação do token.
- `npm run web:check`: lint, tipos, 86 testes e build aprovados.
- `npm run lint` e `npm run typecheck`: aprovados.
- `npm run docs:check`: sem problemas; formatação dos arquivos alterados aprovada.
- `npm run persona:release-check`: recusou publicação conforme esperado.

A primeira execução de `web:check` no sandbox falhou em seis arquivos por
ENOENT no cache temporário do Vitest; a rodada integral fora desse sandbox
passou. Não houve relaxamento de testes/tipos. Build conserva avisos de
anotações de dependência e tamanho do bundle, sem falha de compilação.

Os logs locais de reprodução/regressão ficam em `node_modules/.cache/inspection-*`;
são auxiliares ignorados, não artefatos de aceite. A fixture de cada rodada foi
removida após a execução. HTTPS, conexão ChatGPT e avaliação da IA permanecem
manuais. O manifesto continua `ready: false`, sem gates aceitos.
