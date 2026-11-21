# Relatórios PDF — contrato proposto e prova F0

Registro histórico da F0. O avanço posterior autorizado está no
[contrato de implementação](pdf-reports.md); as limitações abaixo descrevem
o snapshot do experimento, não o estado atual de desenvolvimento.

Estado em 20/11/2026: **proposta para revisão, não implementada no runtime**.
O usuário autorizou definir contratos e avaliar PDFKit com dados sintéticos;
avanço para F1 e qualquer publicação exigem apresentação dos resultados primeiro.
Não há tool PDF gerada, capability concedida, migration ou runner PDF oficial.
O contrato vigente de [anexos](attachments.md) permanece JSON/BLOB.

## Decisões da F0

1. MVP: uma consulta, uma skill e uma fonte; captura fresca única durante a
   requisição autenticada. Apenas a renderização é assíncrona. PDF com várias
   páginas não implica várias consultas. Worker não recebe autoridade SQL.
2. Reusar validação, finalidades e guardas de `source-query.ts`, adicionando
   futuramente contexto explícito de exportação PDF. Não chamar `exportJson`
   para aproveitar sua capability e não copiar o parser.
3. Não afirmar snapshot pelo fato de haver um SELECT. `integral` significa
   cobertura integral da consulta com completude positiva, não fechamento
   contábil nem isolamento consistente comprovado. Incluir `consistency:
not_asserted` até existir prova oficial por motor. Pedido de snapshot forte
   deve ser recusado se indisponível, nunca convertido silenciosamente.
4. Renderer preferido para o MVP: PDFKit já presente, em adapter independente
   da conversão legada. Experimento não altera templates ou contratos legados.
5. Adiar gráficos, múltiplas seções, captura reaproveitável e coleta em lotes.
   Não criar fallback para consulta adicional quando o resultado for truncado.

## Contratos de entrada propostos

O [schema executável de F0](../../scripts/homologation/pdf-report-f0-contract.ts)
é apenas instrumento offline; não está registrado no MCP nem na publicação.

| Superfície futura        | Contrato                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `criar_relatorio_pdf`    | `schemaVersion:1`, `requestId` UUID, `query` derivada de sourceQuerySchema com fonte e exatamente uma skill, `scope`, `layout` fechado. |
| `obter_status_relatorio` | Apenas `jobId` UUID; identidade derivada da autenticação. Não aceita SQL, parâmetros ou nova autorização.                               |
| `cancelar_relatorio`     | Apenas `jobId`; transição idempotente. Não promete cancelar SQL enviado.                                                                |
| `obter_anexo`            | Handle existente, com união discriminada futura `format:pdf` e verificação específica de generatedPdf.                                  |

`scope` é `pagina`, `limitado` ou `integral`. Apenas `pagina` admite page/pageSize
em options; é leitura nova, não cópia da tela. `limitado` identifica recorte
explicitamente limitado; `integral` exige ausência de truncamento e prova de
completude do transporte. Limite não pode ser ultrapassado para buscar uma linha
de prova. Se a prova faltar, recusar integral, sem fallback parcial não solicitado.

`layout`: templateId `table-v1`, orientation portrait/landscape, de uma a oito
colunas únicas da projeção autorizada. Ordem dos registros pertence ao SQL;
colunas apenas selecionam/ordenam apresentação. Sem título livre no MVP:
título/labels vêm do template editorial. Sem HTML/CSS/SVG/JS, URL, formatter,
fórmula ou imagem fornecidos pelo consumidor. Schema estrutural não autoriza
campos: validação semântica posterior confere projeção, exportação e finalidades.

Contrato editorial futuro `generatedPdf`, schemaVersion 1: templates permitidos,
lista de colunas exportáveis (formatos/unidades vêm do treinamento publicado) e limites maxRows, maxPages,
maxBytes, ttlMs. Capability proposta `generated-pdf-contract:<hash>` vincula
fonte, publicação e contrato completo. Exige token/consentimento explícitos;
JSON/BLOB não concedem PDF. Campos de filtros/JOIN mantêm suas finalidades sem
serem automaticamente exportáveis. Filtros impressos exigem allowlist editorial;
não imprimir params, contexto privado ou `__scope_*`.

## Estados, captura e idempotência

Fluxo proposto: `accepted → validating → collecting → captured → rendering → ready`.
Terminais de recusa: `failed`, `capture_unconfirmed`, `cancelled`, `expired`.
Estado técnico e disponibilidade do arquivo são distintos: ready pode expirar ou
ser cancelado; nunca volta a collecting. Não repetir SELECT em nenhum estado.

Antes do envio SQL, persistir reserva e claim de captura com CAS/fencing. Rede
fora do lock/transação MCP. Só o criador autenticado pode fazer o primeiro
dispatch; workers nunca retomam captura, mesmo após crash antes de enviar SQL.
Perda de confirmação durante collecting termina capture_unconfirmed, sem entrega.
Após retorno e revalidações finais, selar captura completa/cifrada com hash,
tipos, ordem, proveniência, completude e autoridade fixada. Falha antes do selo
não gera job renderizável. Não sustentar transação ERP durante renderização.

`requestId + binding` é único; fingerprint HMAC do pedido canônico evita hashes
de parâmetros de baixa entropia. Mesma chave/pedido devolve o mesmo job, nunca
captura novamente; payload diferente produz conflito genérico sem revelar nomes.
Tombstone mínimo permanente conserva somente hashes HMAC, fingerprint, deadline
e desfecho: mesma chave expirada devolve indisponível, nunca faz nova captura.
Uma nova geração explícita exige novo requestId. Quota de metadados precisa ser
definida em F2; atingir o teto recusa admissão, não elimina proteção contra replay.

Renderer isolado recebe somente captura mínima, sem Bearer, refresh, keyring,
DATABASE_URL ou credencial hub. Orquestrador confiável revalida autoridade antes
de despachar e finalizar; renderer não decide permissões. Cancelamento e ready
competem pelo mesmo CAS. Crash do renderer só pode retomar captura selada dentro
do deadline e de orçamento limitado; nunca retorna ao SQL.

Finalização futura é transação única de job, artefato e auditoria. O store atual
`put` não basta: gera handle novo e guarda apenas hash. Será necessário guardar
o descritor recuperável, incluindo handle, **somente cifrado**, com binding e
prazo autenticados; índice por hash. Resposta perdida recupera o mesmo descritor,
sem segundo arquivo. Status revalida antes de revelar progresso ou handle.
ID inexistente e inacessível têm resposta igual.

## Prazos, quotas e segurança

- Na admissão, fixar prazo de trabalho: menor entre 60s, timeout solicitado,
  limites vigentes e validade original de token/access/concessão. Inclui captura,
  fila, renderização e finalização; não renova em cada etapa.
- Prazo do arquivo: menor entre admissão + ttl contratado (até 15 minutos),
  validade original do consumidor/access e demais limites. Não contar TTL de
  novo a partir de ready. Refresh/polling não estendem trabalho ou arquivo.
- Proposta inicial conservadora: até 5000 linhas, 250 páginas, 8 MiB finais;
  menor teto vigente sempre prevalece. Bytes de captura, cifra/base64 e memória
  têm limites próprios: proposta de 16 MiB de captura e 32 MiB de persistência
  por job, a validar com overhead real. Não são quotas já implementadas.
- Proposta para primeira homologação: um render por worker; limites de processo
  e quota global/por persona medidos em F2/F4 antes da escolha de produção.
  Não deduzir concorrência ou SLA a partir do benchmark sequencial F0.
- Reserva atômica permanece até limpeza comprovada, inclusive após falhas.
  Leases/deadlines usam relógio PostgreSQL. Novas cifras/tabelas precisam entrar
  no cofre/recifra e RBAC; migrations aplicadas não mudam.
- Render sem rede, acesso arbitrário ao host, ações PDF, anexos embutidos ou
  carregamento de fontes por URL. Processo sem credenciais e temporário privado.
  A POC local não certifica esse isolamento de produção.
- Logs/auditoria: somente metadados permitidos, fase, código seguro, supportId;
  sem SQL, valores, labels, título, caminhos privados ou mensagens do renderer.
  Falha de auditoria impede ready. Nenhum byte antes da revalidação de download;
  revogação não recolhe bytes já transmitidos.

## Prova técnica reproduzível

Código: [gerador sintético](../../scripts/homologation/pdf-report-f0.ts),
[verificador independente](../../scripts/homologation/verify-pdf-report-f0.py) e
[regressões offline](../../tests/unit/persona-v2/pdf-report-f0.test.ts).
Artefatos privados/reconstruíveis em `node_modules/.cache/pdf-report-f0`.

Executar cada caso em processo novo com Node 24 do projeto:

```powershell
& scripts/with-project-node.ps1 npx tsx scripts/homologation/pdf-report-f0.ts 31 portrait
& scripts/with-project-node.ps1 npx vitest run tests/unit/persona-v2/pdf-report-f0.test.ts
```

O verificador Python requer pdfplumber, pypdf, Pillow e Poppler pdftoppm. Confere
ordem/identidade e valores exatos por linha, cabeçalhos/rodapés, texto dentro das
margens e ausência de OpenAction. Renderiza todas as páginas, produz contatos
visuais; extração de texto isolada não aprova legibilidade. Fontes padrão Helvetica
da POC não certificam embedding, PDF/A, PDF/UA ou todos os idiomas.

Experimento usa tabelas nativas do PDFKit, com planejamento explícito de páginas
e repetição de cabeçalho pelo adapter de prova. Não pressupõe repetição automática.
Altura de célula usa a mesma fonte/largura da tabela, sem ellipsis; célula maior
que a área útil deve recusar em vez de cortar. Dinheiro sintético usa BigInt em
centavos; não é contrato universal de escala monetária de fontes reais.

## Resultados observados em 20/11/2026

Node 24.21.0 / PDFKit 0.20.2 MIT / Windows / Intel Core Ultra 7 155H /
32 GB de RAM. Uma execução por cenário, processo novo, concorrência 1. Duração
mede somente geração, não startup/imports, parser, render visual ou acesso a banco.
Pico RSS inclui o processo TSX e imports do contrato; não é memória incremental
exclusiva do PDFKit nem orçamento certificado de container.

Validador independente: Python 3.12.14, pdfplumber 0.11.9, pypdf 6.21.4,
Pillow 13.0.0 e Poppler 26.07.0 do runtime local disponível. Nenhum pacote
foi instalado para esta prova. Checks focados: 12 testes F0 e 25 de treinamento,
typecheck, ESLint dos três arquivos TypeScript da F0, Prettier e docs:check.
Gate completo de release não foi executado nem é declarado aprovado.

| Linhas | Orientação | Páginas | Bytes PDF | Geração (ms) | Pico RSS (KiB) |
| ------ | ---------- | ------- | --------- | ------------ | -------------- |
| 0      | Retrato    | 1       | 2026      | 55           | 181732         |
| 1      | Retrato    | 1       | 2417      | 21           | 158864         |
| 30     | Retrato    | 2       | 6362      | 36           | 167620         |
| 31     | Retrato    | 2       | 6454      | 54           | 191912         |
| 60     | Retrato    | 3       | 10475     | 62           | 178496         |
| 61     | Retrato    | 3       | 10567     | 66           | 178704         |
| 5000   | Retrato    | 209     | 736383    | 1515         | 291364         |
| 61     | Paisagem   | 5       | 13073     | 61           | 179684         |

O caso 5000 atingiu aproximadamente 285 MiB de pico RSS total; baseline desse
processo era aproximadamente 153 MiB. Nenhum ganho percentual, SLA ou teste de
concorrência foi inferido. Valores mudam com máquina, importação e conteúdo.

Verificação independente: oito PDFs, 226 páginas renderizadas por Poppler;
pypdf/pdfplumber confirmaram páginas, IDs em ordem sem perda/duplicação, valores
monetários exatos, nulos, descrição multilinha, cabeçalhos/rodapés, margens e
ausência de OpenAction. Contatos de todas as páginas foram inspecionados; páginas
de retrato e paisagem também em resolução maior, sem corte aparente nesta amostra.

A primeira versão da POC gerava páginas extras contendo só rodapé: texto ultrapassava
a área útil inferior. Corrigido reposicionando o rodapé; a asserção de número de
páginas e o verificador independente detectam a regressão. Resultado reexecutado
passou. Isso é correção da POC, não defeito confirmado no runtime existente.

Limitações observadas: Poppler avisou ausência de fontes de substituição Symbol
e ArialUnicode no ambiente. Os acentos portugueses da amostra foram extraídos e
renderizados corretamente; embedding/licença de fonte distribuível e cobertura
de idiomas permanecem gates F4. Não alegar PDF/A, PDF/UA ou validação completa
contra conteúdo ativo só pela ausência de OpenAction.

Auditoria `npm audit --omit=dev`: um pacote com severidade moderada (`hono`,
transitivo, cinco advisories); nenhum aviso atribuído ao PDFKit nessa resposta.
Isso não equivale à ausência de vulnerabilidades. Advisory de referência:
[GHSA-4m76-xfj5-7975](https://github.com/advisories/GHSA-4m76-xfj5-7975).
Não houve instalação/upgrade, alteração de lockfile ou correção fora da F0.
Revisão/remediação das dependências fica pendente antes da liberação.

Parecer: **PDFKit viável para seguir como candidato do MVP**, sem necessidade
demonstrada de adicionar outro gerador. F0 não certifica isolamento de processo,
concorrência, memória em produção, snapshot de motor, autoridade assíncrona,
persistência/recifra, download ChatGPT ou feature pronta. Não avançar para F1 nem
registrar tools sem a revisão dos resultados pelo usuário.

## Sequência posterior sujeita à revisão

F1: contratos publicados/capabilities/finalidades; F2: persistência/CAS/quotas/
recifra; F3: captura única na cadeia nativa dos motores anunciados; F4: renderer
isolado e PDFs válidos; F5: entrega HTTP/MCP/OAuth e download no ChatGPT; F6:
gráficos; F7: múltiplas seções e sessão consistente quando oficialmente suportada.

Publication runner não testa PDF. Estender testes existentes de anexos, cofre e
cadeia oficial; PDFs atuais de assinatura não são documentos válidos. Manifesto
de homologação PDF deve existir antes de registrar runner no catálogo externo.
Nenhuma POC autoriza ERP ou amplia publicações/concessões.
