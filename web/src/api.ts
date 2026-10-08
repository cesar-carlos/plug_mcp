export interface DomainFailure {
  success: false;
  code: string;
  message: string;
  hint: string;
  source?: string;
  nextAction?: string;
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
  readonly source?: string;
  readonly nextAction?: string;
  readonly retryable?: boolean;
  constructor(failure: DomainFailure, status: number) {
    super(failure.message);
    this.name = "ConsoleApiError";
    this.code = failure.code;
    this.hint = failure.hint;
    this.status = status;
    this.source = failure.error?.source ?? failure.source;
    this.nextAction = failure.error?.nextAction ?? failure.nextAction;
    this.retryable = failure.error?.retryable;
  }
}

let requestGeneration = 0;
const controllers = new Set<AbortController>();
export const invalidateRequests = (): void => {
  requestGeneration += 1;
  for (const controller of controllers) {
    controller.abort();
  }
  controllers.clear();
};
export const isCancelled = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";
const cancelled = (): Error =>
  Object.assign(new Error("Requisição cancelada."), { name: "AbortError" });

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
  const generation = requestGeneration;
  const controller = new AbortController();
  controllers.add(controller);
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(path, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    if (controller.signal.aborted || generation !== requestGeneration) {
      throw cancelled();
    }
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new ConsoleApiError(
        {
          success: false,
          code: "INVALID_RESPONSE",
          message: "O servidor devolveu uma resposta incompatível.",
          hint: "Confira a conexão e tente novamente. Nenhuma operação será repetida automaticamente.",
        },
        response.status,
      );
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ConsoleApiError(
        {
          success: false,
          code: "INVALID_RESPONSE",
          message: "Resposta do servidor incompatível.",
          hint: "Atualize a página ou confira a conexão.",
        },
        response.status,
      );
    }
  } catch (error) {
    if (controller.signal.aborted || generation !== requestGeneration || isCancelled(error)) {
      throw cancelled();
    }
    if (error instanceof ConsoleApiError) {
      throw error;
    }
    throw new ConsoleApiError(
      {
        success: false,
        code: "NETWORK_ERROR",
        message: "Não foi possível conectar ao servidor.",
        hint: "Confira a conexão. Antes de reenviar uma alteração, verifique seu estado atual.",
      },
      0,
    );
  } finally {
    controllers.delete(controller);
  }
  if (
    !response.ok ||
    (payload && typeof payload === "object" && "success" in payload && payload.success === false)
  ) {
    const failure = payload as Record<string, unknown>;
    const details =
      failure.error && typeof failure.error === "object" && !Array.isArray(failure.error)
        ? (failure.error as Record<string, unknown>)
        : {};
    throw new ConsoleApiError(
      {
        success: false,
        code: typeof failure.code === "string" ? failure.code : "REQUEST_FAILED",
        message: typeof failure.message === "string" ? failure.message : "Operação recusada.",
        hint: typeof failure.hint === "string" ? failure.hint : "",
        source: typeof failure.source === "string" ? failure.source : undefined,
        nextAction: typeof failure.nextAction === "string" ? failure.nextAction : undefined,
        error: {
          code: typeof details.code === "string" ? details.code : "REQUEST_FAILED",
          message: typeof details.message === "string" ? details.message : "Operação recusada.",
          hint: typeof details.hint === "string" ? details.hint : "",
          source: typeof details.source === "string" ? details.source : undefined,
          nextAction: typeof details.nextAction === "string" ? details.nextAction : undefined,
          retryable: typeof details.retryable === "boolean" ? details.retryable : undefined,
        },
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
  statusRascunho?: string;
  publicacaoAtivaId?: string | null;
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
  tabelaId?: string | null;
  fonteTipo?: string;
  fonteReferencia?: string | null;
  responsavel?: string | null;
  validadoEm?: string | null;
  vigenteDe?: string | null;
  vigenteAte?: string | null;
  revisarEm?: string | null;
  periodoRevisaoDias?: number | null;
  status?: string;
  ativaAgora: boolean;
  revisao: { pendente: boolean; proximaEm: string | null; venceEm: string | null };
}
