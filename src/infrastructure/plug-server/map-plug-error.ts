import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES, type ErrorCode } from "../../domain/errors/error-codes.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { hintSqlNaoClassificavel } from "../../application/use-cases/shared/sql-classification-hint.js";

export interface PlugHttpFailure {
  readonly status: number;
  readonly body: unknown;
  readonly retryAfterMs?: number | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const readString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
};

const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const isAbortError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  ((error as { name: string }).name === "AbortError" ||
    (error as { name: string }).name === "TimeoutError");

export const mapPlugServerAbort = (): DomainError =>
  new DomainError({
    code: ERROR_CODES.PLUG_SERVER_TIMEOUT,
    message: "A chamada HTTP ao plug-server excedeu o tempo limite.",
    hint: "Tente de novo. Se persistir, o plug-server ou a rede podem estar indisponíveis. Não aumente o SQL até o serviço responder.",
    retryable: true,
    retryAfterMs: 3000,
  });

export const extractRpcError = (
  body: unknown,
): {
  code?: number;
  message?: string;
  reason?: string;
  retryAfterMs?: number;
  technicalMessage?: string;
} => {
  const root = asRecord(body);
  const response = asRecord(root?.response) ?? asRecord(root?.data) ?? root;
  const item = asRecord(response?.item) ?? asRecord(response?.error) ?? response;
  const error = asRecord(item?.error) ?? asRecord(root?.error) ?? item;
  const data = asRecord(error?.data);
  const code = readNumber(error?.code);
  const message = readString(error?.message, item?.message, root?.message);
  const reason = readString(data?.reason, error?.reason, root?.code);
  // technical_message/user_message só existem no envelope de erro RFC7807 do plug_agente (perfil
  // 2.7+); usamos para dar hints mais específicos que o "reason" genérico (ex.: SQL não classificável).
  const technicalMessage = readString(data?.technical_message, data?.user_message);
  const retryAfterMs =
    readNumber(data?.retry_after_ms) ??
    (typeof data?.reset_at === "string"
      ? Math.max(0, Date.parse(data.reset_at) - Date.now())
      : undefined);
  return { code, message, reason, retryAfterMs, technicalMessage };
};

// Descoberto via teste live: SQL que o plug_agente não classifica (sem FROM, dialeto errado,
// wrap de página) volta -32002/"Not authorized" mesmo com client_token permissivo. Isso não é
// token revogado — mapeamos para INVALID_SQL.
export const isUnclassifiableSqlDenial = (
  rpcCode: number,
  technicalMessage: string | undefined,
): boolean => rpcCode === -32002 && /classification/i.test(technicalMessage ?? "");

/** SQL Server 1033: ORDER BY em derived table do wrap gerenciado (page+page_size). */
export const HINT_SQLSERVER_PAGINACAO_1033 =
  "O wrap gerenciado do hub colocou ORDER BY numa derived table (SQL Server 1033). Não repita options.page neste SQL. Sem página: TOP n + ORDER BY (guia://dialeto/mssql). Não acrescente OFFSET/FETCH com page — o validador recusa. validar_consulta já passa neste caso. O rewrite OFFSET/FETCH é do plug_agente.";

export const isSqlServerOrderByWrap = (blob: string): boolean =>
  /\b1033\b/.test(blob) ||
  /order by clause is invalid/i.test(blob) ||
  /cl[aá]usula order by [eé] inv[aá]lida/i.test(blob);

const rpcMap: Record<
  number,
  { code: ErrorCode; message: string; hint: string; retryable: boolean }
> = {
  [-32001]: {
    code: ERROR_CODES.MISSING_CLIENT_TOKEN,
    message: "O agente recusou a consulta por falta de client_token.",
    hint: "Grave o client_token no acesso (registrar_acesso / adicionar_acesso). Sem esse token o agente recusa sql.execute.",
    retryable: false,
  },
  [-32002]: {
    code: ERROR_CODES.ACCESS_REVOKED,
    message: "Acesso SQL recusado ou token revogado neste agente.",
    hint: "client_token revogado ou sem permissão. Confira o acesso (verificar_acesso) e peça um client_token válido ao admin do ERP.",
    retryable: false,
  },
  [-32008]: {
    code: ERROR_CODES.QUERY_TIMEOUT,
    message: "A consulta excedeu o tempo limite no agente.",
    hint: "Reduza o período, adicione filtros ou aumente options.timeout_ms. Evite SELECT * sem WHERE.",
    retryable: true,
  },
  [-32009]: {
    code: ERROR_CODES.INVALID_SQL,
    message: "O SQL enviado foi recusado pelo agente.",
    hint: "Corrija o SQL no dialeto do agentId. Use o sqlModelo de obter_skill e declare ORDER BY se paginar. Não invente SQL a partir do grafo.",
    retryable: false,
  },
  [-32013]: {
    code: ERROR_CODES.RATE_LIMITED,
    message: "Rate limit do agente.",
    hint: "Aguarde retryAfterMs e tente de novo. Evite rajadas de consultar_dados.",
    retryable: true,
  },
  [-32000]: {
    code: ERROR_CODES.AGENT_UNAVAILABLE,
    message: "O plug_agente está indisponível neste hub.",
    hint: "O plug_agente está offline neste hub. Peça ao usuário para verificar se o agente está ligado e tente novamente.",
    retryable: true,
  },
};

const logPlugDetail = (
  logger: LoggerPort | undefined,
  failure: PlugHttpFailure,
  rpc: ReturnType<typeof extractRpcError>,
): void => {
  logger?.warn("plug-server failure detail", {
    status: failure.status,
    rpcCode: rpc.code,
    rpcMessage: rpc.message,
    rpcReason: rpc.reason,
    technicalMessage: rpc.technicalMessage,
  });
};

export const mapPlugServerFailure = (
  failure: PlugHttpFailure,
  logger?: LoggerPort,
  stage = "rpc",
): DomainError => {
  const rpc = extractRpcError(failure.body);
  const rpcHaystack = [rpc.message, rpc.reason, rpc.technicalMessage]
    .filter((item): item is string => Boolean(item))
    .join(" ");
  if (isSqlServerOrderByWrap(rpcHaystack)) {
    logPlugDetail(logger, failure, rpc);
    return new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "O SQL Server recusou ORDER BY no wrap de paginação gerenciada.",
      hint: HINT_SQLSERVER_PAGINACAO_1033,
      retryable: false,
      retryAfterMs: rpc.retryAfterMs ?? failure.retryAfterMs ?? null,
      source: "client_token_rpc",
      stage,
      nextAction: "consultar_dados",
    });
  }
  if (typeof rpc.code === "number") {
    const mapped = rpcMap[rpc.code];
    if (mapped) {
      const unclassifiableSql = isUnclassifiableSqlDenial(rpc.code, rpc.technicalMessage);
      logPlugDetail(logger, failure, rpc);
      if (unclassifiableSql) {
        return new DomainError({
          code: ERROR_CODES.INVALID_SQL,
          message: "O agente não classificou este SQL para autorização.",
          hint: hintSqlNaoClassificavel(),
          retryable: false,
          retryAfterMs: rpc.retryAfterMs ?? failure.retryAfterMs ?? null,
          source: "client_token_rpc",
          stage: "sql.execute",
        });
      }
      return new DomainError({
        code: mapped.code,
        message: mapped.message,
        hint: mapped.hint,
        retryable: mapped.retryable,
        retryAfterMs: rpc.retryAfterMs ?? failure.retryAfterMs ?? null,
        source: "client_token_rpc",
        stage,
      });
    }
  }

  logPlugDetail(logger, failure, rpc);

  if (failure.status === 401) {
    return new DomainError({
      code: ERROR_CODES.USER_AUTH_EXPIRED,
      message: "JWT do Client no plug-server recusado.",
      hint: "O MCP tenta refresh e, se falhar, login de novo com e-mail/senha do cofre. Se persistir, chame atualizar_credencial_plug.",
      retryable: true,
      source: "plug_server_http",
      stage,
    });
  }
  if (failure.status === 403) {
    const blob = JSON.stringify(failure.body ?? {}).toLowerCase();
    const clientInactive = /pending|blocked|inactive|not active|não ativ/.test(blob);
    if (clientInactive) {
      return new DomainError({
        code: ERROR_CODES.CLIENT_NOT_ACTIVE,
        message: "O Client existe no plug-server mas não está ativo.",
        hint: "Peça ao dono do ERP para ativar o Client. Não trate como senha errada.",
        source: "plug_server_http",
        stage,
      });
    }
    return new DomainError({
      code: ERROR_CODES.AGENT_ACCESS_DENIED,
      message: "Client sem acesso aprovado a este agente.",
      hint: "Peça ao dono do Agent para ativar o Client e aprovar o acesso. Não trate como senha errada.",
      source: "client_agent_access",
      stage,
    });
  }
  if (failure.status === 429) {
    return new DomainError({
      code: ERROR_CODES.RATE_LIMITED,
      message: "Rate limit do plug-server.",
      hint: "Respeite retryAfterMs / RateLimit-Reset antes de nova chamada.",
      retryable: true,
      retryAfterMs: failure.retryAfterMs ?? rpc.retryAfterMs ?? 5000,
      source: "client_token_rpc",
      stage,
    });
  }
  if (failure.status === 503) {
    return new DomainError({
      code: ERROR_CODES.AGENT_UNAVAILABLE,
      message: "plug-server temporariamente indisponível.",
      hint: "Fila cheia ou agente offline. Tente de novo com backoff.",
      retryable: true,
      retryAfterMs: failure.retryAfterMs ?? 3000,
      source: "client_token_rpc",
      stage,
    });
  }

  const raw =
    rpc.message ??
    (typeof asRecord(failure.body)?.message === "string"
      ? (asRecord(failure.body)?.message as string)
      : "");
  const lower = `${raw} ${rpc.reason ?? ""}`.toLowerCase();
  if (lower.includes("permission") || lower.includes("not allowed") || lower.includes("denied")) {
    return new DomainError({
      code: ERROR_CODES.PERMISSION_DENIED,
      message: "O client_token não autoriza esta operação.",
      hint: "O client_token não cobre esta tabela/operação. Peça liberação no ERP ou ajuste o SQL.",
      source: "client_token_rpc",
      stage,
    });
  }

  return new DomainError({
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "Falha ao comunicar com o plug-server.",
    hint: "Ajuste o SQL ou verifique o status do ambiente. Se retryable não estiver indicado, não insista no mesmo comando.",
    retryable: failure.status >= 500,
    retryAfterMs: failure.retryAfterMs ?? null,
    source: "client_token_rpc",
    stage,
  });
};

export const parseRetryAfterMs = (
  header: string | null,
  rateLimitReset: string | null,
): number | null => {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  if (rateLimitReset) {
    const unix = Number(rateLimitReset);
    if (Number.isFinite(unix)) {
      const ms = unix > 1_000_000_000_000 ? unix : unix * 1000;
      return Math.max(0, ms - Date.now());
    }
  }
  return null;
};
