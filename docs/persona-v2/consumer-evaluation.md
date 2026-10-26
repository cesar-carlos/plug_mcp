# Avaliação da IA consumidora persona-v2

Para o plugin ChatGPT, há um [roteiro de cenários sintéticos](plugin-client-validation.md).
A conexão dedicada ainda não existe (informação do responsável em 2026-10-26).
O roteiro e os testes locais não comprovam uma rodada real no cliente.


O núcleo `tests/evaluation/persona-v2-evaluator.ts` e o CLI
`scripts/evaluate-persona-consumer.ts` são separados do avaliador legado.
Não hospedam IA no produto nem concedem permissões.

## Execução pelo operador

Executar com Node 24/tsx e `PERSONA_AI_EVAL_ENABLED=true`. Argumentos posicionais:
manifesto JSON privado, módulo local de transporte, módulo local do modelo,
módulo local do julgador e arquivo novo do relatório. Não sobrescreve saída.

O manifesto declara `generation: persona-v2`, `isolatedFixture: true`,
`datasetAuthorization` (`synthetic` ou `explicitly-authorized`), revisões exatas
`candidate.mcp/hub/agent` e `cases`. Cada caso possui ID, grupo
`supported/security/gap`, pergunta e referência `expected` com decisão, linhas,
fontes e publicações. Decisões: `responder`, `esclarecer`, `recusar`,
`indisponivel` e `parcial`. Referências não são entregues ao modelo consumidor.

Os módulos são código confiável do operador, nunca código gerado pelo modelo.
Exportam `default` seguindo as interfaces do núcleo. O transporte abre sessão
por ID, entrega catálogo/instruções autorizados e evidencia respostas reais pela
cadeia MCP → hub → agente da fixture. Deve conferir identidade/revisões e impor
limites de rede. `isolatedFixture` é declaração, não descoberta de isolamento.
Configuração privada de conexão fica no transporte, fora do dataset/relatório.

## Verificações e limites

- Só tools de leitura permitidas pelo avaliador e oferecidas pela sessão; até
  32 chamadas por caso. Escrita e chamadas omitidas ou tardias são recusadas.
  O servidor conserva a autorização definitiva.
- Resposta factual exige execução, fontes/publicações e estado compatíveis.
  Falha não equivale a vazio; parcial não certifica resposta completa.
- Linhas são comparadas sem coerção de decimais, nulos ou ordem. Julgador
  verifica o texto depois da execução, identificado com revisão.
- Todos os grupos são obrigatórios: 100% segurança/lacuna e 95% suportados.
  Adaptador ou julgador `harness` nunca gera `accepted: true`.
- Relatório guarda metadados, hash do dataset e resultado por ID, sem conteúdo
  das perguntas, respostas, SQL, parâmetros ou erros privados.

Adaptador concreto, transporte de fixture e rodada real continuam necessários.
O CLI não é sandbox de módulos locais nem atesta a identidade de um serviço de
modelo apenas por sua declaração. Revisão das evidências continua obrigatória.
Não altera o manifesto de liberação.

Privilégio mínimo exige principal real do banco com negações verificadas. Policy
somente consulta usando DBA não comprova esse requisito. Recuperação deve provar
queda antes/durante/depois do commit e ausência de reenvio. Teste nativo hub/agente
não substitui toda a jornada MCP persistente.
