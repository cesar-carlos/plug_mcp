import { ERROR_CODES, type ErrorCode } from "./error-codes.js";

export interface PublicQueryFailure {
  readonly message: string;
  readonly hint: string;
}

/** Frases fixas por código. Nunca incluem texto recebido do hub. */
const PUBLIC_QUERY_FAILURES: Partial<Record<ErrorCode, PublicQueryFailure>> = {
  [ERROR_CODES.MISSING_CLIENT_TOKEN]: {
    message: "O agente recusou a consulta por falta de client_token.",
    hint: "Grave o client_token no acesso. Sem esse token o agente recusa a consulta. Não reescreva o SQL.",
  },
  [ERROR_CODES.ACCESS_REVOKED]: {
    message: "Acesso SQL recusado ou token revogado neste agente.",
    hint: "Confira a credencial e o acesso ao agente. Não reescreva o SQL nem repita automaticamente.",
  },
  [ERROR_CODES.PLUG_SERVER_ERROR]: {
    message: "Falha ao comunicar com o plug-server.",
    hint: "Não reescreva o SQL. Falha de transporte não autoriza repetir automaticamente.",
  },
  [ERROR_CODES.PLUG_SERVER_TIMEOUT]: {
    message: "A chamada HTTP ao plug-server excedeu o tempo limite.",
    hint: "Não reescreva o SQL nem repita automaticamente.",
  },
  [ERROR_CODES.INVALID_SQL]: {
    message: "O motor SQL no agente recusou o SQL (não foi o validador do pacote MCP).",
    hint: "Corrija o SQL no dialeto da fonte. Não invente identificador.",
  },
  [ERROR_CODES.QUERY_TIMEOUT]: {
    message: "A consulta excedeu o tempo limite no agente.",
    hint: "Não repita automaticamente.",
  },
  [ERROR_CODES.RATE_LIMITED]: {
    message: "O limite de chamadas foi atingido.",
    hint: "Aguarde antes de uma nova tentativa explícita. Não repita automaticamente.",
  },
  [ERROR_CODES.AGENT_UNAVAILABLE]: {
    message: "O plug_agente está indisponível neste hub.",
    hint: "Não altere o SQL. Confira se o agente está ligado antes de uma nova tentativa explícita.",
  },
  [ERROR_CODES.CONSULTA_ORCAMENTO]: {
    message: "O agente recusou o resultado por tamanho.",
    hint: "Reduza a página ou o recorte. Não repita a mesma consulta automaticamente.",
  },
  [ERROR_CODES.USER_AUTH_EXPIRED]: {
    message: "JWT do Client no plug-server recusado.",
    hint: "Confira a conta do responsável. Não reescreva o SQL.",
  },
  [ERROR_CODES.CLIENT_NOT_ACTIVE]: {
    message: "O Client existe no plug-server mas não está ativo.",
    hint: "Ative o Client no hub antes de consultar. Não reescreva o SQL.",
  },
  [ERROR_CODES.AGENT_ACCESS_DENIED]: {
    message: "Client sem acesso aprovado a este agente.",
    hint: "Confira o acesso do Client ao agente. Não reescreva o SQL.",
  },
  [ERROR_CODES.PERMISSION_DENIED]: {
    message: "O client_token não autoriza esta operação.",
    hint: "Confira a policy do client_token. Não reescreva o SQL.",
  },
  [ERROR_CODES.CREDENTIAL_STALE]: {
    message: "A identidade da fonte divergiu na conexão executora.",
    hint: "Não reassocie a base automaticamente nem reescreva o SQL.",
  },
};

export function publicQueryFailure(code: string): PublicQueryFailure | undefined {
  if (!Object.hasOwn(PUBLIC_QUERY_FAILURES, code)) return undefined;
  return PUBLIC_QUERY_FAILURES[code as ErrorCode];
}
