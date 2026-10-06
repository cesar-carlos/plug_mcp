import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import type {
  AuthorizedRepositories,
  AuthorizedUnitOfWorkPort,
} from "../../domain/ports/authorized-unit-of-work.port.js";
import type { ConsumerAuth } from "../../domain/entities/consumer-auth.js";
import type { OAuthStorePort } from "../../domain/ports/oauth.port.js";
import type { OAuthPolicy } from "../../application/use-cases/chatgpt-oauth.js";
import { currentConsumerAuth } from "../../application/session-context.js";
import { oauthUnauthorized } from "../../domain/errors/oauth-error.js";
import { lockAuthorization } from "./drizzle/lock-authorization.js";
import type { Db } from "./drizzle/db.js";
import * as schema from "./schema.js";

interface TransactionScope {
  auth?: ConsumerAuth;
  repositories: AuthorizedRepositories;
  accessIds: readonly string[];
}
const scope = new AsyncLocalStorage<TransactionScope>();
const existingScope = (
  auth?: ConsumerAuth,
  accessIds: readonly string[] = [],
): TransactionScope | undefined => {
  const active = scope.getStore();
  if (
    active &&
    (active.auth?.kind !== auth?.kind ||
      (auth?.kind === "oauth" &&
        active.auth?.kind === "oauth" &&
        active.auth.grantId !== auth.grantId))
  )
    throw oauthUnauthorized();
  if (active && auth?.kind === "oauth" && accessIds.some((id) => !active.accessIds.includes(id)))
    throw new Error("Acessos adicionais devem ser declarados antes da transação.");
  return active;
};
/** O hub nunca deve ser chamado com locks/transação local abertos. */
export const assertOutsideAuthorizedTransaction = (): void => {
  if (scope.getStore()) throw new Error("Chamada ao hub dentro de transação local autorizada.");
};

export class PostgresAuthorizedUnitOfWork implements AuthorizedUnitOfWorkPort {
  constructor(
    private readonly pool: pg.Pool,
    private readonly policy: OAuthPolicy,
    private readonly repositories: (db: Db) => AuthorizedRepositories,
  ) {}
  async run<T>(
    auth: ConsumerAuth | undefined,
    operation: (r: AuthorizedRepositories) => Promise<T>,
    accessIds: readonly string[] = [],
  ): Promise<T> {
    const active = existingScope(auth, accessIds);
    if (active) return operation(active.repositories);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const checkCommit =
        auth?.kind === "oauth"
          ? await lockAuthorization(client, auth, this.policy, accessIds)
          : undefined;
      const db = drizzle(client, { schema });
      // Os métodos atômicos existentes compartilham a transação, sem BEGIN/savepoint independente.
      db.transaction = ((callback: (tx: Db) => Promise<unknown>) =>
        callback(db)) as Db["transaction"];
      const repositories = this.repositories(db);
      const result = await scope.run(
        { auth, repositories, accessIds: [...accessIds, ...(auth ? [auth.acessoId] : [])] },
        () => operation(repositories),
      );
      checkCommit?.();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Apenas estado de dados; locks/promises e referências entre adapters não são copiados. */
const checkpoint = (repositories: AuthorizedRepositories): (() => void) => {
  const states: { owner: Record<string, unknown>; key: string; value: unknown }[] = [];
  for (const repo of Object.values(repositories)) {
    const owner = repo as Record<string, unknown>;
    for (const [key, value] of Object.entries(owner)) {
      if (key === "locks" || key === "tails") continue;
      if (value instanceof Map || Array.isArray(value))
        states.push({ owner, key, value: structuredClone(value) });
    }
  }
  return () => {
    for (const state of states) state.owner[state.key] = state.value;
  };
};
export class MemoryAuthorizedUnitOfWork implements AuthorizedUnitOfWorkPort {
  constructor(
    private readonly repositories: AuthorizedRepositories,
    private readonly store: OAuthStorePort,
    private readonly policy: OAuthPolicy,
    private readonly now: () => number = Date.now,
  ) {}
  async run<T>(
    auth: ConsumerAuth | undefined,
    operation: (r: AuthorizedRepositories) => Promise<T>,
    accessIds: readonly string[] = [],
  ): Promise<T> {
    const active = existingScope(auth, accessIds);
    if (active) return operation(active.repositories);
    return this.store.transaction(
      auth?.acessoId ?? null,
      auth?.kind === "oauth" ? auth.grantId : null,
      async (tx) => {
        const grant = auth?.kind === "oauth" ? await tx.get("grant", auth.grantId) : null;
        const source = auth?.kind === "oauth" ? await tx.source(auth.acessoId) : null;
        const checkCommit = (): void => {
          if (auth?.kind !== "oauth") return;
          if (
            !grant ||
            source?.usuarioId !== auth.usuarioId ||
            source.tokenHash !== auth.sourceHash ||
            source.statusAcesso === "revoked" ||
            (source.tokenExpiresAt?.getTime() ?? Infinity) <= this.now() ||
            grant.acessoId !== auth.acessoId ||
            grant.usuarioId !== auth.usuarioId ||
            grant.sourceHash !== auth.sourceHash ||
            grant.revokedAt !== undefined ||
            grant.expiresAt <= this.now() ||
            auth.expiresAt <= this.now() ||
            !this.policy.accesses.includes(auth.acessoId) ||
            !this.policy.clients[grant.clientId]?.includes(grant.redirectUri) ||
            grant.resource !== this.policy.resource ||
            grant.scope !== "se7e:access"
          )
            throw oauthUnauthorized();
        };
        checkCommit();
        const rollback = checkpoint(this.repositories);
        try {
          const result = await scope.run(
            {
              auth,
              repositories: this.repositories,
              accessIds: [...accessIds, ...(auth ? [auth.acessoId] : [])],
            },
            () => operation(this.repositories),
          );
          checkCommit();
          return result;
        } catch (error) {
          rollback();
          throw error;
        }
      },
    );
  }
}

type MethodMode = "read" | "write" | "maintenance";
type Modes = {
  [K in keyof AuthorizedRepositories]: Record<keyof AuthorizedRepositories[K], MethodMode>;
};
/** Contrato explícito por método. Adicionar método a um port exige classificar seus efeitos. */
export const repositoryMethodModes = {
  usuarios: {
    create: "write",
    findById: "read",
    findByEmailHash: "read",
    updateCredenciais: "write",
    deleteById: "write",
  },
  acessos: {
    create: "write",
    findById: "read",
    findByIdForUsuario: "read",
    findByTokenHash: "read",
    listByUsuario: "read",
    listAll: "maintenance",
    findByUsuarioAgentTokenHash: "read",
    updateTokenHash: "write",
    compareAndRotateToken: "write",
    updateStatus: "write",
    updateClientToken: "write",
    updateDialeto: "write",
    updateEscopoPadrao: "write",
    updatePersona: "write",
    deleteById: "write",
  },
  grafo: {
    withAcessoLock: "write",
    getDialeto: "read",
    setDialeto: "write",
    deleteByAcesso: "write",
    mergeTabela: "write",
    mergeColuna: "write",
    mergeRelacionamento: "write",
    deleteRelacionamento: "write",
    listTabelas: "read",
    listColunas: "read",
    listRelacionamentos: "read",
    countConflitos: "read",
    listConflitos: "read",
    findTabelaByNome: "read",
    findColuna: "read",
    saveSchemaSnapshot: "write",
    listSchemaSnapshots: "read",
    resolverConflito: "write",
    buscar: "read",
  },
  skills: {
    create: "write",
    update: "write",
    setStatus: "write",
    suspenderPublicacao: "write",
    ativarPublicacao: "write",
    findPublicadaById: "read",
    listPublicadas: "read",
    buscarPublicadas: "read",
    findById: "read",
    findBySlug: "read",
    listByAcesso: "read",
    deleteByAcesso: "write",
    deleteById: "write",
    buscar: "read",
  },
  anotacoes: {
    create: "write",
    update: "write",
    list: "read",
    findById: "read",
    deleteByAcesso: "write",
    deleteById: "write",
    buscar: "read",
  },
  aprendizado: {
    paginarConsultas: "read",
    alterarEstado: "write",
    purgeCandidatasAntesDe: "maintenance",
    salvarConsulta: "write",
    listarConsultas: "read",
    listarConsultasDaSkill: "read",
    obterConsulta: "read",
    buscarConsultas: "read",
    registrarSinonimo: "write",
    listarSinonimos: "read",
    desvincularSkill: "write",
    registrarLacuna: "write",
    arquivarLacunaSkillGap: "write",
    listarLacunas: "read",
    deleteByAcesso: "write",
  },
  publicacoes: { latest: "read", publishAtomically: "write" },
  treinamento: { list: "read", append: "write" },
  setup: {
    create: "write",
    find: "read",
    setCsrf: "write",
    claim: "write",
    purgeExpired: "maintenance",
  },
  operacoes: {
    upsertAlerta: "write",
    resolverAusentes: "write",
    listarAlertas: "read",
    obterAlerta: "read",
    reconhecerAlerta: "write",
    obterWebhook: "read",
    salvarWebhook: "write",
    enfileirar: "write",
    reclamarEventos: "maintenance",
    listarEventos: "read",
    marcarEntregue: "maintenance",
    reagendarFalha: "maintenance",
    rearmarEvento: "write",
  },
  audit: {
    append: "maintenance",
    purgeOlderThan: "maintenance",
    listByUsuario: "read",
    listByAcesso: "read",
  },
} satisfies Modes;

export const authorizedRepositories = (
  base: AuthorizedRepositories,
  unit: AuthorizedUnitOfWorkPort,
): AuthorizedRepositories => {
  const result = {} as AuthorizedRepositories;
  for (const key of Object.keys(repositoryMethodModes) as (keyof AuthorizedRepositories)[]) {
    const facade: Record<string, unknown> = {};
    for (const [method, mode] of Object.entries(repositoryMethodModes[key])) {
      if (typeof Reflect.get(base[key], method) !== "function") continue;
      facade[method] = (...args: unknown[]): Promise<unknown> => {
        const invoke = (r: AuthorizedRepositories): Promise<unknown> =>
          Reflect.apply(
            Reflect.get(r[key], method) as (...a: unknown[]) => Promise<unknown>,
            r[key],
            args,
          );
        const auth = currentConsumerAuth();
        if (mode === "maintenance") {
          if (scope.getStore()) return invoke(scope.getStore()!.repositories);
          return invoke(base);
        }
        if (mode === "write" && auth?.kind === "oauth") {
          const targets = key === "acessos" && method !== "create" ? [String(args[0])] : [];
          return unit.run(auth, invoke, targets);
        }
        return invoke(scope.getStore()?.repositories ?? base);
      };
    }
    Object.assign(result, { [key]: facade });
  }
  return result;
};
