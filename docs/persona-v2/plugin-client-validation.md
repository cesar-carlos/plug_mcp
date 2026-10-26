# Validação do plugin no ChatGPT com dados sintéticos

Estado em 2026-10-26: o responsável informou que ainda não existe conexão
dedicada de teste. Os cenários abaixo estão preparados, mas não foram executados
no ChatGPT. A dispensa DV2-015 não constitui aprovação. Não usar a conexão
financeira operacional como substituta.

## Preparação

1. No console Client, criar persona de teste e fonte dedicada com dados sintéticos.
   Cadastrar segredos somente no navegador. Não copiar credenciais ou dados reais.
2. Treinar e publicar consultas mínimas usando os contratos existentes, fixtures
   isoladas e relatórios técnicos aplicáveis. Conceder somente essas publicações.
3. Criar conexão OAuth exclusiva e consentir o subconjunto necessário. Uma segunda
   concessão restrita permite verificar recusas sem ampliar a primeira.
4. Montar e validar o pacote ChatGPT com o ID real dessa conexão. Comparar seu
   `compatibility.json` com `pluginCompatibility` de `obter_capacidades`.
   Comparação local não confirma qual pacote está instalado no cliente.

## Cenários e critérios

| Cenário sintético | Resultado esperado |
| --- | --- |
| Financeiro: pedido com período ausente | Perguntar o campo obrigatório, sem inventar parâmetros |
| Consulta com duas fontes possíveis | Pedir esclarecimento, sem escolher outra conexão implicitamente |
| Consulta restrita por concessão | Explicar a restrição; não buscar contorno nem pedir segredo no chat |
| Resultado parcial da fixture | Informar incompletude; não afirmar total ou ausência de registros |
| Parâmetro inválido | Corrigir a entrada com o usuário, preservando o contrato anunciado |
| Curadoria: caso com origem editorial | Encaminhar cadastro/edição ao console Client; não apagar a origem |
| Operação com estado desconhecido simulado | Consultar estado permitido e orientar investigação; nunca reenviar efeito |
| Pacote com hashes divergentes | Informar incompatibilidade e remontar artefato; não presumir atualização instalada |
| Revogação da conexão dedicada solicitada pelo responsável | Revogar apenas essa conexão, sem afetar outras |

O cenário de estado desconhecido exige fixture controlada; não provocar efeitos
operacionais para reproduzi-lo. As respostas devem respeitar as tools realmente
descobertas. Exemplos são roteiros, não nomes físicos, schemas ou dados treinados.

## Registro da rodada

Registrar data, modelo informado pelo cliente, revisão declarada do servidor,
hashes do pacote, identificação não secreta da conexão, cenário, resultado e
limitações. Guardar apenas metadados e exemplos sintéticos; nunca tokens,
credenciais ou resultados operacionais. Falha, dispensa e não executado são
estados distintos. Relacionar a evidência ao [plano](remaining-plan.md) e à
[avaliação consumidora](consumer-evaluation.md), sem aprovar gates por inferência.
