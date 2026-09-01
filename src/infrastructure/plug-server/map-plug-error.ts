import { DomainError, ERROR_SOURCE } from "../../domain/errors/domain-error.js";
import { ERROR_CODES, type ErrorCode } from "../../domain/errors/error-codes.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { hintSqlNaoClassificavel } from "../../application/use-cases/shared/sql-classification-hint.js";

export interface PlugHttpFailure {
  readonly status: number;
  readonly body: unknown;
  readonly retryAfterMs?: number | null;
}

/** Origem visível à IA: JWT/HTTP do hub vs acesso vs policy vs motor SQL (não o validador do pacote). */
export const HUB_ERROR_SOURCE = {
  http: ERROR_SOURCE.http,
  access: ERROR_SOURCE.access,
  policy: ERROR_SOURCE.policy,
  sqlEngine: ERROR_SOURCE.sqlEngine,
} as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const readString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
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
    hint: "Tente de novo após retryAfterMs. Não aumente o SQL nem trate como recusa do pacote até o hub responder.",
    retryable: true,
    retryAfterMs: 3000,
    source: HUB_ERROR_SOURCE.http,
    stage: "rpc",
  });

export const extractRpcError = (
  body: unknown,
): {
  code?: number;
  message?: string;
  reason?: string;
  retryAfterMs?: number;
  technicalMessage?: string;
  userMessage?: string;
  hubRetryable?: boolean;
} => {
  const root = asRecord(body);
  const response = asRecord(root?.response) ?? asRecord(root?.data) ?? root;
  const item = asRecord(response?.item) ?? asRecord(response?.error) ?? response;
  const error = asRecord(item?.error) ?? asRecord(root?.error) ?? item;
  const data = asRecord(error?.data);
  const code = readNumber(error?.code);
  const message = readString(error?.message, item?.message, root?.message);
  const reason = readString(data?.reason, error?.reason, root?.code);
  // technical_message vs user_message: o motor (ODBC/SQLSTATE) fica em technical_message no perfil
  // 2.7+; user_message é genérico. A IA precisa do técnico para não repetir o padrão.
  const technicalMessage = readString(data?.technical_message);
  const userMessage = readString(data?.user_message);
  const hubRetryable = typeof data?.retryable === "boolean" ? data.retryable : undefined;
  const retryAfterMs =
    readNumber(data?.retry_after_ms) ??
    (typeof data?.reset_at === "string"
      ? Math.max(0, Date.parse(data.reset_at) - Date.now())
      : undefined);
  return {
    code,
    message,
    reason,
    retryAfterMs,
    technicalMessage,
    userMessage,
    hubRetryable,
  };
};

const rpcHaystackOf = (rpc: ReturnType<typeof extractRpcError>): string =>
  [rpc.message, rpc.reason, rpc.technicalMessage, rpc.userMessage]
    .filter((item): item is string => Boolean(item))
    .join(" ");

// Descoberto via teste live: SQL que o plug_agente não classifica (sem FROM, dialeto errado,
// wrap de página) volta -32002/"Not authorized" mesmo com client_token permissivo. Isso não é
// token revogado — mapeamos para INVALID_SQL.
export const isUnclassifiableSqlDenial = (
  rpcCode: number,
  technicalMessage: string | undefined,
  haystack = "",
): boolean => rpcCode === -32002 && /classification/i.test(`${technicalMessage ?? ""} ${haystack}`);

/** SQL Server 1033: ORDER BY em derived table do wrap gerenciado (page+page_size). */
export const HINT_SQLSERVER_PAGINACAO_1033 =
  "O wrap gerenciado do hub colocou ORDER BY numa derived table (SQL Server 1033). Não persista este SQL. Não repita options.page neste SQL. Sem página: TOP n + ORDER BY (guia://dialeto/mssql). Não acrescente OFFSET/FETCH com page — o validador recusa. validar_consulta já passa neste caso. O rewrite OFFSET/FETCH é do plug_agente. Não é recusa do pacote MCP.";

export const isSqlServerOrderByWrap = (blob: string): boolean =>
  /\b1033\b/.test(blob) ||
  /order by clause is invalid/i.test(blob) ||
  /cl[aá]usula order by [eé] inv[aá]lida/i.test(blob);

const looksLikeEngineSql = (blob: string): boolean =>
  /\b(sql state|odbc|invalid column|invalid object|unknown column|syntax error|conversion failed|does not exist|undefined column|42P01|42703|\b1033\b|\b207\b|\b208\b)\b/i.test(
    blob,
  );

const isInvalidIdentificadorMotor = (blob: string): boolean =>
  /invalid column name/i.test(blob) ||
  /invalid object name/i.test(blob) ||
  /unknown column/i.test(blob) ||
  /coluna .*(inv[aá]lida|n[aã]o existe)/i.test(blob) ||
  /objeto .*(inv[aá]lido|n[aã]o existe)/i.test(blob) ||
  /does not exist/i.test(blob) ||
  /undefined column/i.test(blob) ||
  /\b42703\b/.test(blob) ||
  /\b42P01\b/.test(blob);

const sanitizeEngineMessage = (raw: string): string => {
  let text = raw.replace(/\s+/g, " ").trim();
  text = text.replace(/bearer\s+\S+/gi, "[redacted]");
  text = text.replace(/"client[_-]?token"\s*:\s*"[^"]*"/gi, "[redacted]");
  text = text.replace(/client[_-]?token[=:\s]+\S+/gi, "[redacted]");
  text = text.replace(/password[=:\s]+\S+/gi, "[redacted]");
  text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]");
  if (text.length > 500) {
    return `${text.slice(0, 500)}…`;
  }
  return text;
};

const HUB_SQL_LEARN =
  " Não persista este SQL. Não é o validador do pacote MCP (TABELA_FORA_DO_ESCOPO / SELECT *); leia Motor/details.engineMessage e não repita o identificador/padrão recusado.";

const nextActionFromEngine = (blob: string): string => {
  if (isInvalidIdentificadorMotor(blob)) {
    return "mapear_tabela";
  }
  return "validar_consulta";
};

const engineDetails = (
  rpc: ReturnType<typeof extractRpcError>,
  haystack: string,
): {
  hintSuffix: string;
  details: { rpcCode: number | undefined; engineMessage: string };
} | null => {
  const raw = rpc.technicalMessage ?? rpc.message ?? rpc.userMessage ?? haystack;
  if (!raw.trim()) {
    return null;
  }
  const engineMessage = sanitizeEngineMessage(raw);
  if (!engineMessage) {
    return null;
  }
  return {
    hintSuffix: ` Motor: ${engineMessage}`,
    details: { rpcCode: rpc.code, engineMessage },
  };
};

interface RpcMapping {
  readonly code: ErrorCode;
  readonly message: string;
  readonly hint: string;
  readonly retryable: boolean;
  readonly source: string;
  readonly sqlEngine?: boolean;
  readonly nextAction?: string;
}

const mappingMissingClientToken: RpcMapping = {
  code: ERROR_CODES.MISSING_CLIENT_TOKEN,
  message: "O agente recusou a consulta por falta de client_token.",
  hint: "Grave o client_token no acesso (registrar_acesso / adicionar_acesso). Sem esse token o agente recusa sql.execute. Não é SQL inválido nem senha do MCP.",
  retryable: false,
  source: HUB_ERROR_SOURCE.policy,
};

const mappingInvalidClientTokenAuth: RpcMapping = {
  code: ERROR_CODES.ACCESS_REVOKED,
  message: "O agente recusou a credencial do client_token.",
  hint: "Assinatura ou autenticação do client_token falhou (invalid_signature / authentication_failed). Não trate como token ausente e não cadastre de novo como se faltasse. Confira o token com atualizar_credencial_plug. Não reescreva o SQL.",
  retryable: false,
  source: HUB_ERROR_SOURCE.policy,
};

const mappingInvalidPayload: RpcMapping = {
  code: ERROR_CODES.PLUG_SERVER_ERROR,
  message: "O hub recusou o payload (frame/assinatura/batch), não o SQL.",
  hint: "Não reescreva o SQL. Problema de transporte (PayloadFrame / invalid_payload / batch), não do motor nem do pacote MCP. Tente de novo; se persistir, reporte details.rpcCode.",
  retryable: false,
  source: HUB_ERROR_SOURCE.http,
};

const mappingSqlEngineInvalid: RpcMapping = {
  code: ERROR_CODES.INVALID_SQL,
  message: "O motor SQL no agente recusou o SQL (não foi o validador do pacote MCP).",
  hint: `Corrija o SQL no dialeto do agentId. Use sqlModelo de obter_skill. Não invente identificador a partir do grafo.${HUB_SQL_LEARN}`,
  retryable: false,
  source: HUB_ERROR_SOURCE.sqlEngine,
  sqlEngine: true,
};

const mappingFor32001 = (reason: string | undefined, haystack: string): RpcMapping => {
  const r = (reason ?? "").toLowerCase();
  const hay = haystack.toLowerCase();
  if (r === "missing_client_token") {
    return mappingMissingClientToken;
  }
  if (r === "invalid_signature" || r === "authentication_failed") {
    return mappingInvalidClientTokenAuth;
  }
  if (!r) {
    if (/\b(?:invalid_signature|authentication_failed)\b/.test(hay)) {
      return mappingInvalidClientTokenAuth;
    }
    return mappingMissingClientToken;
  }
  return mappingInvalidClientTokenAuth;
};

const rpcMap: Record<number, RpcMapping> = {
  [-32001]: mappingMissingClientToken,
  [-32002]: {
    code: ERROR_CODES.ACCESS_REVOKED,
    message: "Acesso SQL recusado ou token revogado neste agente.",
    hint: "Policy do client_token recusada no agente (não é o validador do pacote). Confira verificar_acesso e peça um client_token válido ao admin do ERP. Não reenvie o mesmo SQL para “testar” o token.",
    retryable: false,
    source: HUB_ERROR_SOURCE.policy,
  },
  [-32008]: {
    code: ERROR_CODES.QUERY_TIMEOUT,
    message: "A consulta excedeu o tempo limite no agente.",
    hint: "Timeout no plug_agente, não no validador MCP. Não persista este SQL. Reduza o período, agregue ou pagine; evite aumentar timeout às cegas.",
    retryable: true,
    source: HUB_ERROR_SOURCE.sqlEngine,
    nextAction: "agregar_ou_reduzir",
  },
  [-32009]: mappingInvalidPayload,
  [-32010]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "O hub não conseguiu decodificar o payload do agente.",
    hint: "Falha de transporte (decoding), não de SQL. Não altere o SELECT. Tente de novo; se persistir, reporte ao suporte com o code.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32011]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "O hub não conseguiu descomprimir o payload do agente.",
    hint: "Falha de transporte (compressão), não de SQL. Não altere o SELECT. Tente de novo; se persistir, reporte ao suporte.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32012]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "Erro de rede entre o hub e o plug_agente.",
    hint: "Rede com o agente, não recusa de pacote. Aguarde retryAfterMs e tente de novo sem mudar o SQL.",
    retryable: true,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32013]: {
    code: ERROR_CODES.RATE_LIMITED,
    message: "Rate limit do agente.",
    hint: "Aguarde retryAfterMs e tente de novo. Evite rajadas de consultar_dados. Não altere o SQL só por causa do 429 do agente.",
    retryable: true,
    source: HUB_ERROR_SOURCE.policy,
  },
  [-32014]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "O hub detectou replay do mesmo JSON-RPC id.",
    hint: "replay_detected (~2 min no mesmo agentId). O MCP já gera UUID novo a cada sql.execute. Chame a tool de novo uma vez; não reutilize command.id e não altere o SQL.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32000]: {
    code: ERROR_CODES.AGENT_UNAVAILABLE,
    message: "O plug_agente está indisponível neste hub.",
    hint: "Agente conhecido neste hub mas sem socket /agents. Peça para ligar o plug_agente. Não altere o SQL. Distinto de HTTP 404 (agentId nunca registado nesta réplica).",
    retryable: true,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32101]: {
    code: ERROR_CODES.INVALID_SQL,
    message: "O agente recusou o SQL na validação (não foi o validador do pacote MCP).",
    hint: `SQL recusado pelo plug_agente (sql_validation_failed). Ajuste o SELECT ao dialeto e ao FROM real.${HUB_SQL_LEARN}`,
    retryable: false,
    source: HUB_ERROR_SOURCE.sqlEngine,
    sqlEngine: true,
  },
  [-32102]: {
    code: ERROR_CODES.INVALID_SQL,
    message: "O motor SQL no agente falhou ao executar (não foi o validador do pacote MCP).",
    hint: `Execução recusada no ERP (sql_execution_failed). Corrija o identificador/sintaxe citado no Motor.${HUB_SQL_LEARN}`,
    retryable: false,
    source: HUB_ERROR_SOURCE.sqlEngine,
    sqlEngine: true,
  },
  [-32103]: {
    code: ERROR_CODES.INVALID_SQL,
    message: "O agente recusou uma transação. O MCP só envia SELECT.",
    hint: "Não envie INSERT/UPDATE/DELETE nem BEGIN TRAN. Reescreva como SELECT no pacote. Não persista este SQL.",
    retryable: false,
    source: HUB_ERROR_SOURCE.sqlEngine,
  },
  [-32104]: {
    code: ERROR_CODES.AGENT_UNAVAILABLE,
    message: "Pool de conexões do agente esgotado.",
    hint: "Infra do ERP, não SQL inválido. Aguarde retryAfterMs e tente de novo sem mudar o SELECT.",
    retryable: true,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32105]: {
    code: ERROR_CODES.CONSULTA_ORCAMENTO,
    message: "O agente recusou o resultado por tamanho.",
    hint: "result_too_large no plug_agente, não o teto politicaConsulta do MCP. Agregue, recorte o período ou pagine. Não reenvie o mesmo SELECT largo e não persista este SQL.",
    retryable: false,
    source: HUB_ERROR_SOURCE.sqlEngine,
    nextAction: "agregar_ou_reduzir",
  },
  [-32106]: {
    code: ERROR_CODES.AGENT_UNAVAILABLE,
    message: "O agente não conectou ao banco do ERP.",
    hint: "database_connection_failed. Peça para verificar o plug_agente e o DSN. Não altere o SQL nem trate como gap de skill.",
    retryable: true,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32107]: {
    code: ERROR_CODES.QUERY_TIMEOUT,
    message: "A consulta excedeu o tempo limite no banco (agente).",
    hint: "query_timeout no motor, não no validador MCP. Não persista este SQL. Reduza o período ou agregue; não aumente timeout às cegas.",
    retryable: true,
    source: HUB_ERROR_SOURCE.sqlEngine,
    nextAction: "agregar_ou_reduzir",
  },
  [-32108]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "Configuração de banco inválida no agente.",
    hint: "invalid_database_config. Operador do ERP precisa corrigir o DSN. Não reenvie SQL e não trate como erro de pacote.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32109]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "Execução não encontrada no agente.",
    hint: "execution_not_found (sql.cancel órfão). O MCP não cancela sql.execute. Ignore e não altere o SELECT.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32110]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "A execução foi cancelada no agente.",
    hint: "execution_cancelled no plug_agente, não cancelar_operacao do MCP. Reenvie a consulta se ainda fizer sentido; não persista SQL falho.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
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

const rpcDetails = (
  rpc: ReturnType<typeof extractRpcError>,
  extra?: Record<string, unknown>,
): Record<string, unknown> => ({
  ...(typeof rpc.code === "number" ? { rpcCode: rpc.code } : {}),
  ...(rpc.reason ? { reason: rpc.reason } : {}),
  ...extra,
});

export const mapPlugServerFailure = (
  failure: PlugHttpFailure,
  logger?: LoggerPort,
  stage = "rpc",
): DomainError => {
  const rpc = extractRpcError(failure.body);
  const rpcHaystack = rpcHaystackOf(rpc);
  const reason = (rpc.reason ?? "").toLowerCase();
  const isInvalidPayload = rpc.code === -32009 && reason === "invalid_payload";
  if (!isInvalidPayload && isSqlServerOrderByWrap(rpcHaystack)) {
    logPlugDetail(logger, failure, rpc);
    return new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "O SQL Server recusou ORDER BY no wrap de paginação gerenciada.",
      hint: HINT_SQLSERVER_PAGINACAO_1033,
      retryable: false,
      retryAfterMs: rpc.retryAfterMs ?? failure.retryAfterMs ?? null,
      source: HUB_ERROR_SOURCE.sqlEngine,
      stage,
      nextAction: "consultar_dados",
      details: rpcDetails(rpc),
    });
  }
  if (typeof rpc.code === "number") {
    let mapped: RpcMapping | undefined = rpcMap[rpc.code];
    if (rpc.code === -32001) {
      mapped = mappingFor32001(rpc.reason, rpcHaystack);
    } else if (rpc.code === -32009 && !isInvalidPayload && looksLikeEngineSql(rpcHaystack)) {
      mapped = mappingSqlEngineInvalid;
    }
    if (mapped) {
      const unclassifiableSql = isUnclassifiableSqlDenial(
        rpc.code,
        rpc.technicalMessage,
        rpcHaystack,
      );
      logPlugDetail(logger, failure, rpc);
      if (unclassifiableSql) {
        return new DomainError({
          code: ERROR_CODES.INVALID_SQL,
          message: "O agente não classificou este SQL para autorização.",
          hint: `${hintSqlNaoClassificavel()} Não persista este SQL.`,
          retryable: false,
          retryAfterMs: rpc.retryAfterMs ?? failure.retryAfterMs ?? null,
          source: HUB_ERROR_SOURCE.sqlEngine,
          stage: "sql.execute",
          details: rpcDetails(rpc),
        });
      }
      const engine = mapped.sqlEngine ? engineDetails(rpc, rpcHaystack) : null;
      const disconnected =
        mapped.code === ERROR_CODES.AGENT_UNAVAILABLE &&
        /disconnected/i.test(`${rpc.reason ?? ""} ${rpcHaystack}`);
      const hint = disconnected
        ? "O plug_agente desconectou no dispatch (agent_disconnected_at_dispatch). Não altere o SQL. Peça para religar o agente e tente de novo. Distinto de HTTP 404 (agentId nunca registado nesta réplica)."
        : engine
          ? `${mapped.hint}${engine.hintSuffix}`
          : mapped.hint;
      return new DomainError({
        code: mapped.code,
        message: mapped.message,
        hint,
        retryable: mapped.retryable,
        retryAfterMs: rpc.retryAfterMs ?? failure.retryAfterMs ?? null,
        source: mapped.source,
        stage,
        ...(mapped.nextAction
          ? { nextAction: mapped.nextAction }
          : engine && mapped.code === ERROR_CODES.INVALID_SQL
            ? { nextAction: nextActionFromEngine(rpcHaystack) }
            : {}),
        details: rpcDetails(rpc, engine?.details),
      });
    }
  }

  logPlugDetail(logger, failure, rpc);

  if (failure.status === 401) {
    return new DomainError({
      code: ERROR_CODES.USER_AUTH_EXPIRED,
      message: "JWT do Client no plug-server recusado.",
      hint: "O MCP já tenta refresh e um relogin com a senha do cofre. Se persistir, chame atualizar_credencial_plug. Não é senha do token MCP nem SQL inválido. Não reenvie a consulta para diagnosticar o JWT.",
      retryable: true,
      source: HUB_ERROR_SOURCE.http,
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
        hint: "Peça ao dono do ERP para ativar o Client. Não trate como senha errada, SQL inválido nem gap de skill. Chame verificar_acesso; não faça polling agressivo.",
        source: HUB_ERROR_SOURCE.http,
        stage,
      });
    }
    return new DomainError({
      code: ERROR_CODES.AGENT_ACCESS_DENIED,
      message: "Client sem acesso aprovado a este agente.",
      hint: "Peça ao dono do Agent para ativar o Client e aprovar o acesso. Não trate como senha errada nem como recusa de SQL. verificar_acesso; sem polling agressivo.",
      source: HUB_ERROR_SOURCE.access,
      stage,
    });
  }
  if (failure.status === 404) {
    return new DomainError({
      code: ERROR_CODES.AGENT_UNAVAILABLE,
      message: "agentId desconhecido nesta réplica do hub.",
      hint: "HTTP 404: este agentId nunca fez agent:register neste processo (catálogo vazio nesta réplica). Confira o UUID em listar_acessos e se o plug_agente está ligado. Não reenvie o SQL e não trate como falha de dialeto. Distinto de JSON-RPC -32000 (agente conhecido mas socket desligado).",
      retryable: false,
      source: HUB_ERROR_SOURCE.http,
      stage,
      nextAction: "verificar_acesso",
    });
  }
  if (failure.status === 429) {
    return new DomainError({
      code: ERROR_CODES.RATE_LIMITED,
      message: "Rate limit do plug-server.",
      hint: "HTTP 429 do hub (TOO_MANY_REQUESTS), não recusa de SQL. Respeite retryAfterMs / RateLimit-Reset. Não reenvie em rajada e não altere o SELECT só por causa do limite.",
      retryable: true,
      retryAfterMs: failure.retryAfterMs ?? rpc.retryAfterMs ?? 5000,
      source: HUB_ERROR_SOURCE.http,
      stage,
    });
  }
  if (failure.status === 503) {
    return new DomainError({
      code: ERROR_CODES.AGENT_UNAVAILABLE,
      message: "plug-server temporariamente indisponível.",
      hint: "HTTP 503: fila cheia, agente offline ou Nginx na borda. Aguarde retryAfterMs. Não é recusa de pacote nem de policy. Não aumente o SELECT.",
      retryable: true,
      retryAfterMs: failure.retryAfterMs ?? 3000,
      source: HUB_ERROR_SOURCE.http,
      stage,
    });
  }

  const raw =
    rpc.message ??
    (typeof asRecord(failure.body)?.message === "string"
      ? (asRecord(failure.body)?.message as string)
      : "");
  const lower = `${raw} ${rpc.reason ?? ""}`.toLowerCase();
  if (
    failure.status < 500 &&
    (lower.includes("permission") || lower.includes("not allowed") || lower.includes("denied"))
  ) {
    return new DomainError({
      code: ERROR_CODES.PERMISSION_DENIED,
      message: "O client_token não autoriza esta operação.",
      hint: "Policy do client_token (não o validador do pacote). Peça liberação no ERP ou ajuste o SQL às tabelas da policy. Não persista este SQL. verificar_acesso.",
      source: HUB_ERROR_SOURCE.policy,
      stage,
      details: rpcDetails(rpc),
    });
  }

  const fallbackHaystack = `${raw} ${rpc.reason ?? ""} ${rpc.technicalMessage ?? ""}`;
  const engine = looksLikeEngineSql(fallbackHaystack) ? engineDetails(rpc, fallbackHaystack) : null;
  const rpcLabel = typeof rpc.code === "number" ? ` JSON-RPC ${String(rpc.code)}.` : "";
  const hintBase =
    failure.status >= 500
      ? `HTTP ${String(failure.status)} do hub.${rpcLabel} Não é o validador do pacote. Se Motor aparecer, o SQL chegou ao agente e falhou — não persista; senão é indisponibilidade. Não insista no mesmo comando se retryable for false.`
      : `Falha no hub sem código mapeado.${rpcLabel} Ajuste só se Motor citar identificador; senão verifique o ambiente. Não persista SQL falho. Se retryable não estiver indicado, não insista.`;
  const retryable = rpc.hubRetryable ?? failure.status >= 500;
  return new DomainError({
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "Falha ao comunicar com o plug-server.",
    hint: engine ? `${hintBase}${engine.hintSuffix}` : hintBase,
    retryable,
    retryAfterMs: failure.retryAfterMs ?? rpc.retryAfterMs ?? null,
    source: engine ? HUB_ERROR_SOURCE.sqlEngine : HUB_ERROR_SOURCE.http,
    stage,
    ...(engine ? { nextAction: nextActionFromEngine(fallbackHaystack) } : {}),
    details: rpcDetails(rpc, engine?.details),
  });
};

export const parseRetryAfterMs = (
  header: string | null,
  rateLimitReset: string | null,
): number | null => {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1000);
    }
    const date = Date.parse(header);
    if (Number.isFinite(date)) {
      return Math.max(0, date - Date.now());
    }
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
