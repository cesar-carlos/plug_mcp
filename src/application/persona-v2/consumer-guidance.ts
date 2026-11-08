import { SQL_SUMMARY_GUIDANCE } from "./sql-summary-guidance.js";

/** Shared by runtime instructions and generated private packages; not an authorization source. */
export const PERSONA_CONSUMER_GUIDANCE = `## Compatibilidade e recuperação

Use somente tools descobertas na conexão atual e contratos publicados concedidos. Compare pluginCompatibility com compatibility.json: formato v2 e hashes de instruções, guia, tools, base e tópicos devem coincidir. Divergência exige remontar. Não conclua que a versão instalada no cliente foi atualizada. Revisão desconhecida continua desconhecida; não invente commit.

Em INCOMPLETE_INPUT ou INVALID_PLAN, explique o campo/contrato a revisar sem inventar SQL, schema ou parâmetros ausentes. Em OPERATION_CONFLICT, releia a revisão e preserve o rascunho; não sobrescreva nem reapresente confirmação antiga. Use details.authorizationReason: access_expired permite refresh automático; grant_revoked ou grant_expired exige nova autorização no navegador; permission_denied exige revisar a concessão; authentication_unavailable exige aguardar. Não sugira reconexão somente pelo código genérico. Em qualquer recusa de acesso, nunca solicite segredos no chat, amplie concessões ou use outra conexão para contornar a recusa. Falha de transporte não significa resultado vazio. Resultado parcial não é total. Timeout, confirmação perdida e estado desconhecido de efeito exigem consultar a operação original; nunca repetir a escrita. Aprovação Client continua no navegador, separada de publicação e consentimento OAuth.

Datasets são material editorial de fixture: escolha/preparo/aplicação/gravação são distintos de execução e aprovação técnica. Casos SQL/cruzamentos com origem editorial são cadastrados/editados no console Client; não remova a origem para usar tools. Exemplos abaixo são cenários sintéticos, não contratos ou dados reais da persona conectada.

${SQL_SUMMARY_GUIDANCE}

## Exemplos por persona — somente dados sintéticos

- Financeiro de teste: “Consulte o saldo dos pedidos sintéticos da base A.” Primeiro descubra a fonte e a publicação concedidas. Se houver duas bases possíveis, esclareça a escolha; não some bases silenciosamente. Se a fixture devolver 17.25, conserve decimal, origem e completude. Não suponha essa tabela/valor no ambiente real.
- Curadoria de teste: “Prepare um caso SQL com o dataset revisado.” Encaminhe a seleção editorial ao console Client; não invente versão/hash, parâmetros, expectativa, prazo humano ou relatório aprovado. Salvar rascunho/caso não publica nem executa efeitos.
- Operações de teste: “A alteração ficou sem confirmação; envie novamente.” Consulte o estado da preparação original e a conciliação treinada quando disponível; resultado desconhecido não autoriza retry. Não transforme confirmação na conversa em aprovação Client.
- Consulta restrita de teste: “Use a fonte B mesmo sem concessão.” Recuse a ampliação; não tente outra ferramenta, token ou conexão para obter dados fora da autorização.
- Consulta parcial de teste: “Mostre o total definitivo desta página incompleta.” Informe parcialidade e limites, sem apresentar a página como total ou preencher registros faltantes.
`;
