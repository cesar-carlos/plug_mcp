import { DomainError, ERROR_SOURCE } from "../../domain/errors/domain-error.js";
import { safeErrorDetails } from "../../domain/errors/safe-error-details.js";
import { z } from "zod";
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

const readDelay = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

const delayUntil = (timestamp: number): number | undefined =>
  Number.isSafeInteger(timestamp) ? readDelay(Math.max(0, timestamp - Date.now())) : undefined;

const resetTimestampSchema = z.iso.datetime({ offset: true });

export const isAbortError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  ((error as { name: string }).name === "AbortError" ||
    (error as { name: string }).name === "TimeoutError");

export const mapPlugServerAbort = (stage = "rpc"): DomainError =>
  new DomainError({
    code: ERROR_CODES.PLUG_SERVER_TIMEOUT,
    message: "A chamada HTTP ao plug-server excedeu o tempo limite.",
    hint: "Não repita automaticamente. A interrupção da espera não comprova cancelamento no banco; informe o diagnóstico ao responsável e confira o estado original de operações.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
    stage,
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
  hubCategory?: string;
  sqlstate?: string;
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
  const hubCategory = readString(data?.category);
  const sqlstate = readString(data?.sqlstate, data?.sql_state, data?.sqlState);
  const retryAfterMs =
    readDelay(data?.retry_after_ms) ??
    (typeof data?.reset_at === "string" && resetTimestampSchema.safeParse(data.reset_at).success
      ? delayUntil(Date.parse(data.reset_at))
      : undefined);
  return {
    code,
    message,
    reason,
    retryAfterMs,
    technicalMessage,
    userMessage,
    hubRetryable,
    hubCategory,
    sqlstate,
  };
};

const rpcHaystackOf = (rpc: ReturnType<typeof extractRpcError>): string =>
  [rpc.message, rpc.reason, rpc.technicalMessage, rpc.userMessage, rpc.sqlstate]
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

/** The response alone does not prove whether managed pagination rewrote the query. */
export const HINT_SQLSERVER_PAGINACAO_1033 =
  "SQL Server 1033: revise ORDER BY em views, CTEs, subconsultas e tabelas derivadas conforme guia://dialeto/mssql. O erro isolado não comprova alteração pela paginação gerenciada. Não acrescente TOP ou remova options.page automaticamente; preserve o recorte publicado. Não combine OFFSET/FETCH com page. validar_consulta verifica o contrato local, sem reproduzir o motor ou eventual rewrite do agente. Não persista SQL falho nem repita automaticamente.";

const isSqlServerIdentifierBinding = (blob: string): boolean =>
  /\b4104\b/.test(blob) ||
  (/multi-part identifier/i.test(blob) && /could not be bound/i.test(blob));

export const isSqlServerOrderByWrap = (blob: string): boolean =>
  /\b1033\b/.test(blob) ||
  /order by clause is invalid/i.test(blob) ||
  /cl[aá]usula order by [eé] inv[aá]lida/i.test(blob);

const looksLikeEngineSql = (blob: string): boolean =>
  /\b(sql state|sqlstate|odbc|invalid column|invalid object|unknown column|column unknown|table unknown|dynamic sql error|sql error code|syntax error|conversion failed|does not exist|undefined column|column \S+ not found|table \S+ not found|asa[- ]error|42P01|42703|\b1033\b|\b4104\b|\b207\b|\b208\b)\b/i.test(
    blob,
  );

const isInvalidIdentificadorMotor = (blob: string): boolean =>
  /invalid column name/i.test(blob) ||
  /invalid object name/i.test(blob) ||
  /unknown column/i.test(blob) ||
  /column unknown/i.test(blob) ||
  /table unknown/i.test(blob) ||
  /coluna .*(inv[aá]lida|n[aã]o existe)/i.test(blob) ||
  /objeto .*(inv[aá]lido|n[aã]o existe)/i.test(blob) ||
  /does not exist/i.test(blob) ||
  /undefined column/i.test(blob) ||
  /column \S+ not found/i.test(blob) ||
  /table \S+ not found/i.test(blob) ||
  /sql error code\s*=\s*-20[46]\b/i.test(blob) ||
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

const nodeErrnoOf = (error: unknown, depth = 0): string | undefined => {
  if (depth > 4) {
    return undefined;
  }
  const rec = asRecord(error);
  if (!rec) {
    return undefined;
  }
  const code = safeErrorDetails({ errno: rec.code }).errno;
  if (typeof code === "string") {
    return code;
  }
  return nodeErrnoOf(rec.cause, depth + 1);
};

/** Falha TCP/TLS/`fetch` até o hub — não é recusa de SQL nem INTERNAL_ERROR opaco. */
export const mapPlugServerNetworkError = (error: unknown, stage = "rpc"): DomainError => {
  const errno = nodeErrnoOf(error);
  const errnoHint = errno ? ` (${errno})` : "";
  return new DomainError({
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "Não foi possível conectar ao plug-server.",
    hint: `Falha de rede até o hub${errnoHint}, não recusa de SQL nem de policy. Não altere o SELECT nem repita automaticamente. Informe o diagnóstico ao responsável; a interrupção da resposta não comprova cancelamento no agente.`,
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
    stage,
    details: { transportReason: "network", ...(errno ? { errno } : {}) },
  });
};

const HUB_SQL_LEARN =
  " Não persista este SQL. Não é o validador do pacote MCP (TABELA_FORA_DO_ESCOPO / SELECT *); leia Motor/details.engineMessage e não repita o identificador/padrão recusado.";

const nextActionFromEngine = (blob: string): string => {
  if (isInvalidIdentificadorMotor(blob)) {
    return "mapear_tabela";
  }
  return "validar_consulta";
};

const GENERIC_DRIVER_WRAP =
  /database driver returned an execution error|nao foi possivel executar a consulta|n[aã]o foi poss[ií]vel executar a consulta/i;

const pickEngineRaw = (rpc: ReturnType<typeof extractRpcError>, haystack: string): string => {
  const technical = rpc.technicalMessage?.trim() ?? "";
  const fallback = (rpc.message ?? rpc.userMessage ?? haystack).trim();
  if (technical && !GENERIC_DRIVER_WRAP.test(technical)) {
    return technical;
  }
  if (fallback && !GENERIC_DRIVER_WRAP.test(fallback)) {
    return fallback;
  }
  return technical || fallback;
};

const engineDetails = (
  rpc: ReturnType<typeof extractRpcError>,
  haystack: string,
): {
  hintSuffix: string;
  genericOnly: boolean;
  details: { rpcCode: number | undefined; engineMessage: string; sqlstate?: string };
} | null => {
  const raw = pickEngineRaw(rpc, haystack);
  if (!raw.trim()) {
    return null;
  }
  const engineMessage = sanitizeEngineMessage(raw);
  if (!engineMessage) {
    return null;
  }
  const genericOnly = GENERIC_DRIVER_WRAP.test(engineMessage);
  let hintSuffix = genericOnly
    ? "Motor sem detalhe ODBC: não invente colunas; use mapear_tabela / obter_skill. Não reescreva o SQL por transporte (plug_server_http)."
    : ` Motor: ${engineMessage}`;
  const sqlstate = rpc.sqlstate?.trim();
  if (
    sqlstate &&
    (sqlstate === "42703" || sqlstate === "42P01") &&
    isInvalidIdentificadorMotor(`${engineMessage} ${haystack} ${sqlstate}`)
  ) {
    hintSuffix += ` SQLSTATE ${sqlstate}: identificador Postgres inexistente; não invente coluna — mapear_tabela / obter_skill.`;
  }
  return {
    hintSuffix,
    genericOnly,
    details: {
      rpcCode: rpc.code,
      engineMessage,
      ...(sqlstate ? { sqlstate } : {}),
    },
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
  hint: "Não reescreva o SQL. Problema de transporte (PayloadFrame / invalid_payload / batch), não do motor nem do pacote MCP. Informe o diagnóstico ao responsável e não repita automaticamente.",
  retryable: false,
  source: HUB_ERROR_SOURCE.http,
};

const mappingJsonRpcProtocol = (label: string, retryable = false): RpcMapping => ({
  code: ERROR_CODES.PLUG_SERVER_ERROR,
  message: `O hub recusou o JSON-RPC (${label}), não o SQL.`,
  hint: "Não reescreva o SQL nem repita automaticamente. Erro de protocolo/params no hop hub↔agente exige revisão da requisição pelo responsável; reporte details.rpcCode.",
  retryable,
  source: HUB_ERROR_SOURCE.http,
});

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
  [-32700]: mappingJsonRpcProtocol("parse error"),
  [-32600]: mappingJsonRpcProtocol("invalid request"),
  [-32601]: mappingJsonRpcProtocol("method not found"),
  [-32602]: mappingJsonRpcProtocol("invalid params"),
  [-32603]: mappingJsonRpcProtocol("internal error", true),
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
    hint: "Falha de transporte (decoding), não de SQL. Não altere o SELECT nem repita automaticamente. Informe o diagnóstico ao responsável.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32011]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "O hub não conseguiu descomprimir o payload do agente.",
    hint: "Falha de transporte (compressão), não de SQL. Não altere o SELECT nem repita automaticamente. Informe o diagnóstico ao responsável.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32012]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "Erro de rede entre o hub e o plug_agente.",
    hint: "Rede com o agente, não recusa de pacote. Não altere SQL nem repita automaticamente; informe o diagnóstico ao responsável.",
    retryable: true,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32013]: {
    code: ERROR_CODES.RATE_LIMITED,
    message: "Rate limit do agente.",
    hint: "Respeite retryAfterMs quando informado, sem repetir automaticamente. Evite rajadas de consultar_dados e não altere SQL por causa do limite.",
    retryable: true,
    source: HUB_ERROR_SOURCE.policy,
  },
  [-32014]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "O hub detectou replay do mesmo JSON-RPC id.",
    hint: "replay_detected: não chame a tool novamente nem troque command.id para contornar a recusa. O comando anterior pode ter sido executado. Informe o diagnóstico ao responsável; operações exigem conferir o estado original.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32000]: {
    code: ERROR_CODES.AGENT_UNAVAILABLE,
    message: "O plug_agente está indisponível neste hub.",
    hint: "Agente conhecido neste hub mas sem socket /agents. Peça para ligar o plug_agente. Não altere o SQL. HTTP 404 isolado não comprova esse estado.",
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
    hint: "Infra do ERP, não SQL inválido. Não altere SQL nem repita automaticamente; informe o diagnóstico ao responsável.",
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
    hint: "execution_not_found não comprova ausência de efeito nem rollback. Confira a referência original com o responsável; não altere identificadores nem reenvie o comando.",
    retryable: false,
    source: HUB_ERROR_SOURCE.http,
  },
  [-32110]: {
    code: ERROR_CODES.PLUG_SERVER_ERROR,
    message: "A execução foi cancelada no agente.",
    hint: "execution_cancelled no plug_agente não comprova rollback de operação. Não reenvie automaticamente nem persista SQL falho; confira o estado original quando aplicável.",
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
  });
};

const rpcDetails = (
  rpc: ReturnType<typeof extractRpcError>,
  extra?: Record<string, unknown>,
): Record<string, unknown> => ({
  ...(typeof rpc.code === "number" ? { rpcCode: rpc.code } : {}),
  ...(rpc.reason ? { reason: rpc.reason } : {}),
  ...(rpc.hubCategory ? { hubCategory: rpc.hubCategory } : {}),
  ...(rpc.sqlstate ? { sqlstate: rpc.sqlstate } : {}),
  ...extra,
});

const classifyPlugServerFailure = (
  failure: PlugHttpFailure,
  logger?: LoggerPort,
  stage = "rpc",
): DomainError => {
  const rpc = extractRpcError(failure.body);
  const rpcHaystack = rpcHaystackOf(rpc);
  const reason = (rpc.reason ?? "").toLowerCase();
  const isInvalidPayload = rpc.code === -32009 && reason === "invalid_payload";
  // Textual legacy SQL diagnostics cannot override an explicit non-SQL RPC or HTTP failure.
  const mappedRpc = typeof rpc.code === "number" ? rpcMap[rpc.code] : undefined;
  const mayDiagnoseSql = !mappedRpc || mappedRpc.sqlEngine === true || rpc.code === -32009;
  const identifierBinding = isSqlServerIdentifierBinding(rpcHaystack);
  if (
    failure.status === 200 &&
    mayDiagnoseSql &&
    !isInvalidPayload &&
    (identifierBinding || isSqlServerOrderByWrap(rpcHaystack))
  ) {
    logPlugDetail(logger, failure, rpc);
    return new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: identifierBinding
        ? "O SQL Server não conseguiu resolver um identificador qualificado."
        : "O SQL Server recusou ORDER BY nesse contexto da consulta.",
      hint: identifierBinding
        ? "SQL Server 4104: revise aliases, qualificadores e escopo das referências no contrato publicado. O erro isolado não comprova falha de paginação. Não invente tabelas ou colunas, acrescente TOP ou remova paginação automaticamente. Valide a revisão antes de qualquer execução explícita; validação local não reproduz o motor. Não persista SQL falho nem repita automaticamente."
        : HINT_SQLSERVER_PAGINACAO_1033,
      retryable: false,
      retryAfterMs: rpc.retryAfterMs ?? failure.retryAfterMs ?? null,
      source: HUB_ERROR_SOURCE.sqlEngine,
      stage,
      nextAction: "validar_consulta",
      details: rpcDetails(rpc),
    });
  }
  if (typeof rpc.code === "number") {
    let mapped: RpcMapping | undefined = rpcMap[rpc.code];
    if (rpc.code === -32001) {
      mapped = mappingFor32001(rpc.reason, rpcHaystack);
    } else if (
      failure.status === 200 &&
      rpc.code === -32009 &&
      !isInvalidPayload &&
      looksLikeEngineSql(rpcHaystack)
    ) {
      mapped = mappingSqlEngineInvalid;
    } else if (
      failure.status === 200 &&
      !mapped &&
      !isInvalidPayload &&
      (rpc.hubCategory ?? "").toLowerCase() === "sql"
    ) {
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
        ? "O plug_agente desconectou no dispatch (agent_disconnected_at_dispatch). Não altere o SQL nem repita automaticamente; informe o diagnóstico ao responsável. HTTP 404 isolado não comprova esse estado."
        : engine?.genericOnly
          ? engine.hintSuffix
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
            ? {
                nextAction: engine.genericOnly
                  ? "mapear_tabela"
                  : nextActionFromEngine(rpcHaystack),
              }
            : {}),
        details: rpcDetails(rpc, engine?.details),
      });
    }
  }

  logPlugDetail(logger, failure, rpc);

  if (failure.status === 400) {
    return new DomainError({
      code: ERROR_CODES.PLUG_SERVER_ERROR,
      message: "O hub recusou o pedido (validação HTTP 400), não o SQL.",
      hint: "Não reescreva o SQL. Body/schema recusado no plug-server (Zod), não o motor nem o pacote MCP. Se persistir, reporte details.rpcCode.",
      retryable: false,
      retryAfterMs: rpc.retryAfterMs ?? failure.retryAfterMs ?? null,
      source: HUB_ERROR_SOURCE.http,
      stage,
      details: rpcDetails(rpc),
    });
  }
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
    const root = asRecord(failure.body);
    const httpError = asRecord(root?.error) ?? root;
    const httpCode = readString(httpError?.code, rpc.reason)?.toUpperCase();
    const clientInactive =
      httpCode === "CLIENT_NOT_ACTIVE" ||
      httpCode === "PENDING" ||
      ((!httpCode || httpCode === "FORBIDDEN") &&
        /^(?:Client account is (?:blocked|not active)|Client is pending)$/i.test(
          rpc.message ?? "",
        ));
    if (clientInactive) {
      return new DomainError({
        code: ERROR_CODES.CLIENT_NOT_ACTIVE,
        message: "O Client existe no plug-server mas não está ativo.",
        hint: "Peça ao dono do ERP para ativar o Client. Não trate como senha errada, SQL inválido nem gap de skill. Chame verificar_acesso; não faça polling agressivo.",
        source: HUB_ERROR_SOURCE.http,
        stage,
      });
    }
    if (httpCode !== "AGENT_ACCESS_DENIED") {
      return new DomainError({
        code: ERROR_CODES.PLUG_SERVER_ERROR,
        message: "O hub recusou a solicitação HTTP 403.",
        hint: "A recusa não identifica por si só a conta ou concessão afetada. Informe o diagnóstico ao responsável; não altere SQL, credenciais ou repita automaticamente.",
        source: HUB_ERROR_SOURCE.http,
        stage,
        retryable: false,
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
      code: ERROR_CODES.PLUG_SERVER_ERROR,
      message: "O hub respondeu HTTP 404; o recurso solicitado não foi encontrado.",
      hint: "O status isolado não comprova ausência de registro do agente, desconexão ou revogação. Peça ao responsável para conferir a rota e a referência solicitada. Não altere SQL ou credenciais nem repita automaticamente.",
      retryable: false,
      source: HUB_ERROR_SOURCE.http,
      stage,
    });
  }
  if (failure.status === 429) {
    return new DomainError({
      code: ERROR_CODES.RATE_LIMITED,
      message: "Rate limit do plug-server.",
      hint: "HTTP 429 do hub (TOO_MANY_REQUESTS), não recusa de SQL. Respeite retryAfterMs quando informado; ausência não define prazo de espera. Informe o diagnóstico ao responsável e não repita automaticamente nem altere o SELECT só por causa do limite.",
      retryable: true,
      retryAfterMs: failure.retryAfterMs ?? rpc.retryAfterMs ?? null,
      source: HUB_ERROR_SOURCE.http,
      stage,
    });
  }
  // The bridge can time out after rejecting an agent response; 503 alone is not offline.
  if (
    failure.status === 503 &&
    reason === "service_unavailable" &&
    /timed out waiting for agent response/i.test(rpc.message ?? "")
  ) {
    return new DomainError({
      code: ERROR_CODES.PLUG_SERVER_TIMEOUT,
      message: "O hub excedeu o prazo de espera pela resposta do agente.",
      hint: "Confira os logs de contrato e correlação do hub/agente. Não altere credenciais nem repita automaticamente.",
      source: HUB_ERROR_SOURCE.http,
      stage,
      retryable: false,
    });
  }

  if (failure.status === 503) {
    return new DomainError({
      code: ERROR_CODES.AGENT_UNAVAILABLE,
      message: "plug-server temporariamente indisponível.",
      hint: "HTTP 503 isolado não distingue saturação, proxy ou indisponibilidade do agente. Respeite retryAfterMs quando informado; ausência não define prazo de espera. Informe o diagnóstico ao responsável e não repita automaticamente nem altere o SELECT.",
      retryable: true,
      retryAfterMs: failure.retryAfterMs ?? rpc.retryAfterMs ?? null,
      source: HUB_ERROR_SOURCE.http,
      stage,
    });
  }

  // Unmapped HTTP failures may originate at a proxy. Their text is not proof of SQL/policy.
  if (failure.status !== 200) {
    return new DomainError({
      code: ERROR_CODES.PLUG_SERVER_ERROR,
      message: "Falha ao comunicar com o plug-server.",
      hint: `HTTP ${String(failure.status)} sem causa RPC reconhecida. Informe o diagnóstico ao responsável. Não altere SQL ou credenciais nem repita automaticamente; a falha não comprova execução ou cancelamento no agente.`,
      source: HUB_ERROR_SOURCE.http,
      stage,
      retryable: false,
      retryAfterMs: failure.retryAfterMs ?? rpc.retryAfterMs ?? null,
      details: rpcDetails(rpc),
    });
  }

  const raw =
    rpc.message ??
    (typeof asRecord(failure.body)?.message === "string"
      ? (asRecord(failure.body)?.message as string)
      : "");
  const lower = `${raw} ${rpc.reason ?? ""}`.toLowerCase();
  if (
    failure.status === 200 &&
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

  const fallbackHaystack = `${raw} ${rpc.reason ?? ""} ${rpc.technicalMessage ?? ""} ${rpc.sqlstate ?? ""}`;
  const engine =
    looksLikeEngineSql(fallbackHaystack) || (rpc.hubCategory ?? "").toLowerCase() === "sql"
      ? engineDetails(rpc, fallbackHaystack)
      : null;
  const rpcLabel = typeof rpc.code === "number" ? ` JSON-RPC ${String(rpc.code)}.` : "";
  const hintBase = `Falha no hub sem código mapeado.${rpcLabel} Ajuste só se Motor citar identificador; senão verifique o ambiente. Não persista SQL falho. Se retryable não estiver indicado, não insista.`;
  const retryable = rpc.hubRetryable ?? false;
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

export const mapPlugServerFailure = (
  failure: PlugHttpFailure,
  logger?: LoggerPort,
  stage = "rpc",
): DomainError => {
  const mapped = classifyPlugServerFailure(
    { ...failure, retryAfterMs: readDelay(failure.retryAfterMs) },
    logger,
    stage,
  );
  return new DomainError({
    ...mapped,
    message: mapped.message,
    details: { ...asRecord(mapped.details), httpStatus: failure.status },
  });
};

export const parseRetryAfterMs = (
  header: string | null,
  rateLimitReset: string | null,
): number | null => {
  const value = header?.trim();
  if (value) {
    const delay = /^\d+$/.test(value)
      ? readDelay(Number(value) * 1000)
      : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(value)
        ? delayUntil(Date.parse(value))
        : undefined;
    if (delay !== undefined) return delay;
  }
  const reset = rateLimitReset?.trim();
  if (reset && /^\d+$/.test(reset)) {
    const unix = Number(reset);
    if (Number.isSafeInteger(unix)) {
      const ms = unix > 1_000_000_000_000 ? unix : unix * 1000;
      return delayUntil(ms) ?? null;
    }
  }
  return null;
};
