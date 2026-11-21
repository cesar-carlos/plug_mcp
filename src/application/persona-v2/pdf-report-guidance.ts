/** Conditional guidance: tool discovery and the current publication remain authoritative. */
export const PDF_REPORT_GUIDANCE = {
  recovery:
    "Se a resposta inicial se perder, use localizar_relatorio com o requestId original na mesma conexão; não gere novo pedido. listar_relatorios mostra somente metadados autorizados antes da paginação, sem baixar arquivos ou consultar o ERP. Ausência não autoriza repetição automática.",
  preflight:
    "Quando disponível, validar_relatorio_pdf confere contrato e limites sem SQL ou job. Não reserva autorização nem comprova dados/renderização; a geração revalida tudo.",
  diagnostics:
    "Leia errorCode, renderReason e supportId quando disponíveis. diagnosticPersisted=false indica falha ao gravar o diagnóstico: preserve o protocolo entregue, sem presumir que o próximo status já o contém e sem repetir SQL. Cancelamento confirmado permanece terminal; status e repetição exigem autorização vigente.",
  formatting:
    "PDF usa padrão brasileiro: dd/mm/aaaa, vírgula decimal, ponto de milhar e duas casas decimais para medidas. columnFormats publicado distingue text, number, currency, percent, date, datetime e boolean; códigos permanecem texto. Não inferir tipo pelo alias. Horários preservam fuso informado; UTC continua identificado. Arredondamento é só apresentação; captura original não muda. Percentual já está em pontos percentuais, sem multiplicação implícita.",
  availability:
    "PDF gerado exige criar_relatorio_pdf disponível, generatedPdf publicado, capability própria e exportacao concedida. JSON/BLOB não autorizam PDF. Se indisponível, explique a limitação; não prometa arquivo ou botão de download.",
  request:
    "Gere requestId novo somente para pedido explícito de nova geração. Confira o mesmo jobId após resposta incerta; não crie outra tentativa nem repita SQL automaticamente. A coleta é fresca e única por seção; somente a renderização é assíncrona. Escolha colunas da projeção publicada e template table-v1, sem HTML, scripts, URLs, títulos ou filtros privados.",
  completeness:
    "scope=pagina exige page/pageSize juntos e identifica somente essa página; preserve o tamanho efetivo. scope=limitado identifica recorte. scope=integral exige completude positiva e não aceita paginação. Ausência de linhas não significa total zero. Integral não prova snapshot: consistency=not_asserted. Não converta silenciosamente um pedido integral em parcial, nem totalize apenas a página.",
  lifecycle:
    "Use obter_status_relatorio com jobId, respeitando o prazo original. Apenas state=ready permite usar o descritor com obter_anexo/download autenticado na mesma conexão. Em failed/capture_unconfirmed/expired informe estado e supportId; polling não renova validade e não autoriza retry. cancelar_relatorio impede entrega, mas não confirma cancelamento do SQL em andamento. Não coloque Bearer em URL, compartilhe handles ou publique o arquivo implicitamente.",
  limits:
    "Nesta implementação em validação, tabela com até oito colunas por seção. Coleta em lotes e snapshot forte não estão disponíveis. Texto sem glifos suportados é recusado para preservar fidelidade; não remova caracteres ou dados silenciosamente.",
  sections:
    "Até quatro seções da mesma fonte exigem successiveSections publicado em cada contrato e consistency=successive_reads explícito, com additionalSections. São leituras distintas, com readAt e completude por seção; integral não significa snapshot comum. Se o pedido exige simultaneidade ou conciliação garantida, não use esse modo: informe a limitação ou solicite uma consulta única autorizada. Limites de linhas, bytes, páginas e prazo valem para o conjunto. Falha interrompe as próximas seções, sem retomar ou repetir capturas; nenhuma seção parcial é entregue como relatório completo.",
  charts:
    "Gráfico exige chartId publicado em generatedPdf.charts; não invente IDs nem opções. Barras: até 30 categorias únicas; linhas: até 200 pontos na ordem capturada; composição: até seis categorias, valores não negativos e não nulos. Gráfico e tabela usam a mesma captura, sem agregação adicional. Nulo não vira zero; captura conserva decimais exatos, tabela exibe duas casas e geometria é aproximada. Use unidade publicada e indique PARCIAL quando aplicável. Não altere dados para contornar recusa; informe supportId e proponha nova consulta agregada somente com pedido explícito.",
} as const;
