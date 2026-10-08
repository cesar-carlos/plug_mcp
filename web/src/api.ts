export interface DomainFailure {
  success: false;
  code: string;
  message: string;
  hint: string;
  error?: {
    code: string;
    message: string;
    hint: string;
    retryable?: boolean;
    source?: string;
    nextAction?: string;
  };
}

export class ConsoleApiError extends Error {
  readonly code: string;
  readonly hint: string;
  readonly status: number;
  constructor(failure: DomainFailure, status: number) {
    super(failure.message);
    this.name = "ConsoleApiError";
    this.code = failure.code;
    this.hint = failure.hint;
    this.status = status;
  }
}

const request = async <T>(path: string, init: RequestInit = {}, bearer?: string): Promise<T> => {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (bearer) {
    headers.set("Authorization", `Bearer ${bearer}`);
  }
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T | DomainFailure) : ({} as T);
  if (
    !response.ok ||
    (payload && typeof payload === "object" && "success" in payload && payload.success === false)
  ) {
    const failure = payload as DomainFailure;
    throw new ConsoleApiError(
      {
        success: false,
        code: failure.code ?? "VALIDATION_ERROR",
        message: failure.message ?? "Operação recusada.",
        hint: failure.hint ?? "",
        error: failure.error,
      },
      response.status,
    );
  }
  return payload as T;
};

export const api = {
  get: <T>(path: string, bearer?: string) => request<T>(path, { method: "GET" }, bearer),
  post: <T>(path: string, body?: unknown, bearer?: string) =>
    request<T>(
      path,
      { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) },
      bearer,
    ),
};

export interface SetupBegin {
  success: true;
  setupUrl: string;
  expiresAt: string;
}

export interface SetupForm {
  purpose: "registrar" | "adicionar" | "credenciais" | "rotacionar";
  csrf: string;
  campos: string[];
  recuperar: boolean;
}

export interface SetupComplete {
  success: true;
  token?: string;
  acessoId?: string;
}

export const codeFromSetupUrl = (setupUrl: string): string => {
  const parts = setupUrl.split("/setup/");
  return (parts[1] ?? "").split("?")[0] ?? "";
};

export interface SkillFalta {
  kind: string;
  message: string;
  alvo: string;
  nextAction: string;
}

export interface SkillRow {
  id: string;
  slug: string;
  nome: string;
  status: string;
  podeLiberar?: boolean;
  fluxoTreino?: { proximoPasso?: string | null };
  faltas?: SkillFalta[];
}

export interface SkillSqlModeloRow {
  id: string;
  slug: string;
  nome: string;
  status: string;
  statusRascunho: string;
  motivoRevalidacao: string | null;
  sqlModelo: string;
  faltas: SkillFalta[];
}

export interface AlertaItem {
  id: string;
  categoria: string;
  severidade: string;
  status: string;
}

export interface EntregaItem {
  id: string;
  deadLetter: boolean;
  pendente: boolean;
}

export interface LacunaItem {
  id: string;
  tipo: string;
  status: string;
  pergunta: string;
}

export interface AnotacaoItem {
  id: string;
  tipo: string;
  titulo: string;
  texto: string;
  ativaAgora: boolean;
  revisao: { pendente: boolean; proximaEm: string | null; venceEm: string | null };
}
