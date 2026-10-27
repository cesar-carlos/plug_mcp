import { onBeforeUnmount, ref, type Ref } from "vue";
import { sessionExpirationDelayMs, sessionWarningDelayMs } from "./console-session-timing";
import { ConsoleRequestError, type ContextRequests, type Persona } from "./model";
import type { UncertainIssuance } from "./token-permissions";

export interface ConsoleSessionWorkspace {
  personaSearch: Ref<string>;
  uncertainIssuance: Ref<Record<string, UncertainIssuance>>;
  knowledgeDirty: Ref<boolean>;
  answerDiscard: (value: boolean) => void;
  loadedPersonaId: Ref<string>;
  personas: Ref<Persona[]>;
  personaId: Ref<string>;
  personaForm: { name: string; specialty: string; instructions: string };
  clearPersona: () => void;
}

export function useConsoleSession(
  run: (action: () => Promise<void>) => Promise<void>,
  message: Ref<string>,
  requests: ContextRequests,
  knowledgeRequests: ContextRequests,
  confirmDiscard: () => Promise<boolean>,
  anyDirty: () => boolean,
  workspace: ConsoleSessionWorkspace,
): {
  logged: Ref<boolean>;
  csrf: Ref<string>;
  email: Ref<string>;
  password: Ref<string>;
  expiresSoon: Ref<boolean>;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  knowledgeApi: <T>(url: string, body?: unknown) => Promise<T>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
} {
  const logged = ref(false);
  const csrf = ref("");
  const email = ref("");
  const password = ref("");
  const expiresSoon = ref(false);
  let expiration: number | undefined;
  let warningTimer: number | undefined;

  async function sessionRequest<T>(request: Promise<T>): Promise<T> {
    try {
      return await request;
    } catch (cause) {
      if (cause instanceof ConsoleRequestError && cause.code === "ADMIN_SESSION_EXPIRED") {
        clearSession();
        message.value = "Sua sessão expirou. Entre novamente.";
      }
      throw cause;
    }
  }

  function adminJson<T>(client: ContextRequests, url: string, body?: unknown): Promise<T> {
    return sessionRequest(
      client.json<T>(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.value },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  }

  const api = <T>(url: string, body?: unknown): Promise<T> => adminJson(requests, url, body);
  const knowledgeApi = <T>(url: string, body?: unknown): Promise<T> =>
    adminJson(knowledgeRequests, url, body);

  function clearSession(): void {
    workspace.personaSearch.value = "";
    workspace.uncertainIssuance.value = {};
    requests.reset();
    knowledgeRequests.reset();
    workspace.answerDiscard(false);
    workspace.knowledgeDirty.value = false;
    window.clearTimeout(expiration);
    window.clearTimeout(warningTimer);
    expiresSoon.value = false;
    logged.value = false;
    csrf.value = "";
    password.value = "";
    workspace.loadedPersonaId.value = "";
    workspace.personas.value = [];
    workspace.personaId.value = "";
    workspace.clearPersona();
    Object.assign(workspace.personaForm, { name: "", specialty: "", instructions: "" });
  }

  async function login(): Promise<void> {
    await run(async () => {
      try {
        const session = await api<{ csrfToken: string; expiresAt: string }>("/api/admin/login", {
          email: email.value,
          password: password.value,
        });
        csrf.value = session.csrfToken;
        workspace.personas.value = (
          await api<{ personas: Persona[] }>("/api/admin/personas")
        ).personas;
        logged.value = true;
        const now = Date.now();
        warningTimer = window.setTimeout(
          () => {
            expiresSoon.value = true;
          },
          sessionWarningDelayMs(session.expiresAt, now),
        );
        expiration = window.setTimeout(
          () => {
            clearSession();
            message.value = "Sua sessão expirou. Entre novamente.";
          },
          sessionExpirationDelayMs(session.expiresAt, now),
        );
      } finally {
        password.value = "";
      }
    });
  }

  async function logout(): Promise<void> {
    if (anyDirty() && !(await confirmDiscard())) {
      return;
    }
    await run(async () => {
      try {
        await api("/api/admin/logout", {});
      } finally {
        clearSession();
      }
    });
  }

  onBeforeUnmount(() => {
    window.clearTimeout(expiration);
    window.clearTimeout(warningTimer);
  });

  return {
    logged,
    csrf,
    email,
    password,
    expiresSoon,
    api,
    knowledgeApi,
    login,
    logout,
    clearSession,
  };
}
