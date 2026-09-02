import { ERROR_CODES, type ErrorCode } from "./error-codes.js";

export type ErrorCategory =
  "auth" | "access" | "scope" | "sql" | "privacy" | "profile" | "budget" | "infra" | "validation";

export interface ErrorGuidance {
  readonly category: ErrorCategory;
  readonly nextAction: string;
  readonly documentationUrl: string;
}

export const ERROR_MAPPING_DOC_PATH = "/docs/mcp/error-mapping.md";

const doc = (anchor: string): string => `${ERROR_MAPPING_DOC_PATH}#${anchor}`;

export const absoluteErrorMappingUrl = (publicBaseUrl: string, pathOrUrl: string): string => {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const origin = publicBaseUrl.replace(/\/$/, "");
  return pathOrUrl.startsWith("/") ? `${origin}${pathOrUrl}` : `${origin}/${pathOrUrl}`;
};

const MAP: Partial<Record<ErrorCode, ErrorGuidance>> = {
  [ERROR_CODES.UNAUTHENTICATED]: {
    category: "auth",
    nextAction: "registrar_acesso",
    documentationUrl: doc("unauthenticated"),
  },
  [ERROR_CODES.SKILL_GAP]: {
    category: "scope",
    nextAction: "listar_skills",
    documentationUrl: doc("skill_gap"),
  },
  [ERROR_CODES.TABELA_FORA_DO_ESCOPO]: {
    category: "scope",
    nextAction: "explorar_tabelas",
    documentationUrl: doc("tabela_fora_do_escopo"),
  },
  [ERROR_CODES.COLUNA_FORA_DO_ESCOPO]: {
    category: "scope",
    nextAction: "obter_skill",
    documentationUrl: doc("coluna_fora_do_escopo"),
  },
  [ERROR_CODES.JOIN_DESCONHECIDO]: {
    category: "scope",
    nextAction: "obter_skill",
    documentationUrl: doc("join_desconhecido"),
  },
  [ERROR_CODES.SKILL_NOT_PUBLISHED]: {
    category: "scope",
    nextAction: "publicar_skill",
    documentationUrl: doc("skill_not_published"),
  },
  [ERROR_CODES.ACCESS_REVOKED]: {
    category: "access",
    nextAction: "verificar_acesso",
    documentationUrl: doc("access_revoked"),
  },
  [ERROR_CODES.PERMISSION_DENIED]: {
    category: "access",
    nextAction: "verificar_acesso",
    documentationUrl: doc("permission_denied"),
  },
  [ERROR_CODES.MISSING_CLIENT_TOKEN]: {
    category: "access",
    nextAction: "atualizar_credencial_plug",
    documentationUrl: doc("missing_client_token"),
  },
  [ERROR_CODES.INVALID_SQL]: {
    category: "sql",
    nextAction: "validar_consulta",
    documentationUrl: doc("invalid_sql"),
  },
  [ERROR_CODES.CONSULTA_SEM_RECORTE]: {
    category: "sql",
    nextAction: "agregar_ou_filtrar",
    documentationUrl: doc("consulta_sem_recorte"),
  },
  [ERROR_CODES.MULTI_SKILL_PARAMS]: {
    category: "sql",
    nextAction: "recorte_skillIds",
    documentationUrl: doc("multi_skill_params"),
  },
  [ERROR_CODES.DIALECT_UNSUPPORTED]: {
    category: "sql",
    nextAction: "inspecionar_consulta",
    documentationUrl: doc("dialect_unsupported"),
  },
  [ERROR_CODES.PERFIL_AUSENTE]: {
    category: "profile",
    nextAction: "validar_skill",
    documentationUrl: doc("perfil_ausente"),
  },
  [ERROR_CODES.PACOTE_INCOMPLETO]: {
    category: "profile",
    // Fallback se DomainError.nextAction não vier; exigirEscopoNoGrafo / exigirPacotePublicavel
    // passam a primeira falta bloqueante (confirmar_relacionamento, treinar_sql, …).
    nextAction: "validar_skill",
    documentationUrl: doc("pacote_incompleto"),
  },
  [ERROR_CODES.FANOUT_NAO_DECLARADO]: {
    category: "sql",
    nextAction: "confirmar_relacionamento",
    documentationUrl: doc("fanout_nao_declarado"),
  },
  [ERROR_CODES.PRIVACIDADE_NEGADA]: {
    category: "privacy",
    nextAction: "consultar_dados",
    documentationUrl: doc("privacidade_negada"),
  },
  [ERROR_CODES.CONSULTA_ORCAMENTO]: {
    category: "budget",
    nextAction: "agregar_ou_reduzir",
    documentationUrl: doc("consulta_orcamento"),
  },
  [ERROR_CODES.MIDIA_TIPO_RECUSADO]: {
    category: "validation",
    nextAction: "consultar_dados",
    documentationUrl: doc("midia_tipo_recusado"),
  },
  [ERROR_CODES.MIDIA_TETO]: {
    category: "budget",
    nextAction: "agregar_ou_reduzir",
    documentationUrl: doc("midia_teto"),
  },
  [ERROR_CODES.MIDIA_ORIGEM_INVALIDA]: {
    category: "scope",
    nextAction: "consultar_dados",
    documentationUrl: doc("midia_origem_invalida"),
  },
  [ERROR_CODES.RATE_LIMITED]: {
    category: "infra",
    nextAction: "aguardar_retry_after",
    documentationUrl: doc("rate_limited"),
  },
  [ERROR_CODES.AGENT_UNAVAILABLE]: {
    category: "infra",
    nextAction: "aguardar_retry_after",
    documentationUrl: doc("agent_unavailable"),
  },
  [ERROR_CODES.AGENT_ACCESS_PENDING]: {
    category: "access",
    nextAction: "verificar_acesso",
    documentationUrl: doc("agent_access_pending"),
  },
  [ERROR_CODES.CLIENT_NOT_ACTIVE]: {
    category: "access",
    nextAction: "verificar_acesso",
    documentationUrl: doc("client_not_active"),
  },
  [ERROR_CODES.AGENT_ACCESS_DENIED]: {
    category: "access",
    nextAction: "verificar_acesso",
    documentationUrl: doc("agent_access_denied"),
  },
  [ERROR_CODES.USER_AUTH_EXPIRED]: {
    category: "auth",
    nextAction: "atualizar_credencial_plug",
    documentationUrl: doc("user_auth_expired"),
  },
  [ERROR_CODES.CREDENTIAL_STALE]: {
    category: "auth",
    nextAction: "atualizar_credencial_plug",
    documentationUrl: doc("credential_stale"),
  },
  [ERROR_CODES.QUERY_TIMEOUT]: {
    category: "sql",
    nextAction: "agregar_ou_reduzir",
    documentationUrl: doc("query_timeout"),
  },
  [ERROR_CODES.PLUG_SERVER_TIMEOUT]: {
    category: "infra",
    nextAction: "aguardar_retry_after",
    documentationUrl: doc("plug_server_timeout"),
  },
  [ERROR_CODES.PLUG_SERVER_ERROR]: {
    category: "infra",
    nextAction: "verificar_acesso",
    documentationUrl: doc("plug_server_error"),
  },
};

export const guidanceFor = (
  code: ErrorCode,
  source?: string,
  stage?: string,
): ErrorGuidance | undefined => {
  const base = MAP[code];
  if (!base) {
    return undefined;
  }
  if (code === ERROR_CODES.ACCESS_REVOKED && source === "client_token_rpc") {
    return { ...base, nextAction: "atualizar_credencial_plug" };
  }
  if (code === ERROR_CODES.TABELA_FORA_DO_ESCOPO && source === "sql") {
    return { ...base, nextAction: "obter_skill" };
  }
  if (code === ERROR_CODES.CONSULTA_ORCAMENTO && (stage === "anexo" || source === "mcp")) {
    return { ...base, nextAction: "omitir_coluna_ou_reduzir" };
  }
  return base;
};
