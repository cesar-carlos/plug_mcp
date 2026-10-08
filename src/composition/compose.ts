import { Treinamento } from "../application/use-cases/treinamento.js";
import {
  DrizzleTreinamentoRepository,
  MemoryTreinamentoRepository,
} from "../infrastructure/persistence/treinamento.js";
import { SetupOperations } from "../application/use-cases/setup-operation.js";
import {
  MemorySetupOperations,
  DrizzleSetupOperations,
} from "../infrastructure/persistence/setup-operation.js";
import type { AppConfig } from "../config/env.js";
import {
  AdicionarAcesso,
  AtualizarCredencialPlug,
  AtualizarDialeto,
  AtualizarPersona,
  ListarAcessos,
  RegistrarAcesso,
  RemoverAcesso,
  RotacionarTokenMcp,
  VerificarAcesso,
} from "../application/use-cases/cofre.js";
import {
  BuscarContexto,
  ConsultarDados,
  ExplorarTabelas,
  ListarConflitos,
  MapearTabela,
  ResolverConflito,
  ValidarConsulta,
} from "../application/use-cases/consultar.js";
import {
  CancelarOperacao,
  DescobrirTabela,
  DetectarDerivaEsquema,
  InspecionarConsulta,
} from "../application/use-cases/inspecionar.js";
import { ExportarAnexo } from "../application/use-cases/exportar-anexo.js";
import {
  AtualizarEscopoPadrao,
  HerdarCatalogo,
  ListarAuditoria,
  ListarLacunas,
  ListarMetricasAgente,
  RegistrarAprendizado,
  RegistrarLacunaFerramenta,
  SalvarConsulta,
} from "../application/use-cases/aprendizado.js";
import {
  ConfigurarWebhookOperacional,
  ListarAlertasOperacionais,
  MonitorOperacoes,
  RearmarWebhookOperacional,
  ReconhecerAlertaOperacional,
} from "../application/use-cases/operacoes.js";
import {
  AnotarGrafo,
  AtualizarAnotacao,
  AtualizarSkill,
  ConfirmarColuna,
  ConfirmarRelacionamento,
  CriarSkill,
  DespublicarSkill,
  ExpandirEscopo,
  ListarAnotacoes,
  ListarSkills,
  ListarSqlModelos,
  ObterSkill,
  PublicarSkill,
  RemoverAnotacao,
  RemoverRelacionamento,
  RemoverSkill,
  ValidarSkill,
} from "../application/use-cases/skills.js";
import { TreinarComSql } from "../application/use-cases/treinar-com-sql.js";
import type { LoggerPort } from "../domain/ports/logger.port.js";
import type { PlugServerGatewayPort } from "../domain/ports/plug-server-gateway.port.js";
import type { QueryResultCachePort } from "../domain/ports/query-result-cache.port.js";
import type { QuerySingleflightPort } from "../domain/ports/query-singleflight.port.js";
import { NodeCryptoAdapter } from "../infrastructure/crypto/node-crypto.adapter.js";
import { createExpressApp } from "../infrastructure/http/create-app.js";
import { MemoryRateLimitStore, type RateLimitStore } from "../infrastructure/http/rate-limit.js";
import { RedisRateLimitStore } from "../infrastructure/http/redis-rate-limit.store.js";
import { SetupCodeStore } from "../infrastructure/http/setup-code-store.js";
import { createPino, PinoLoggerAdapter } from "../infrastructure/logging/pino-logger.adapter.js";
import type { ToolUseCases } from "../infrastructure/mcp/register-tools.js";
import { createDb } from "../infrastructure/persistence/drizzle/db.js";
import { DrizzleSkillPublicacaoRepository } from "../infrastructure/persistence/drizzle/drizzle-skill-publicacao.js";
import {
  DrizzleAprendizadoRepository,
  DrizzleAcessoRepository,
  DrizzleAnotacaoGrafoRepository,
  DrizzleAuditLog,
  DrizzleGrafoRepository,
  DrizzleSkillRepository,
  DrizzleUsuarioRepository,
} from "../infrastructure/persistence/drizzle/drizzle-cofre.js";
import {
  InMemoryAprendizadoRepository,
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryAuditLog,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../infrastructure/persistence/memory/memory-cofre.js";
import { InMemorySkillPublicacaoRepository } from "../infrastructure/persistence/memory/memory-skill-publicacao.js";
import { InMemoryOperacoesRepository } from "../infrastructure/persistence/memory/memory-operacoes.js";
import { DrizzleOperacoesRepository } from "../infrastructure/persistence/drizzle/drizzle-operacoes.js";
import { OperacoesWorker } from "../infrastructure/operacoes/webhook-worker.js";
import { PublicHttpsWebhookDestination } from "../infrastructure/operacoes/webhook-destination.js";
import {
  MemoryQueryResultCache,
  RedisQueryResultCache,
} from "../infrastructure/cache/query-result-cache.js";
import {
  MemoryQuerySingleflight,
  RedisQuerySingleflight,
} from "../infrastructure/cache/query-singleflight.js";
import { MemoryAnexoHandleStore } from "../infrastructure/anexo/memory-anexo-handle.js";
import { SharpPdfkitAnexoConverter } from "../infrastructure/anexo/converter-anexo.js";
import {
  createHubHttpAgents,
  createPooledFetch,
  destroyHubHttpAgents,
} from "../infrastructure/plug-server/hub-http.js";
import { CachedPlugGateway } from "../infrastructure/plug-server/policy-cache.js";
import { PlugServerRestAdapter } from "../infrastructure/plug-server/plug-server-rest.adapter.js";
import { UsuarioTokenManager } from "../infrastructure/plug-server/usuario-token-manager.js";
import { createHash } from "node:crypto";
import { ChatGptOAuth, type OAuthPolicy } from "../application/use-cases/chatgpt-oauth.js";
import type { OAuthClientPort, OAuthStorePort } from "../domain/ports/oauth.port.js";
import { MemoryOAuthStore, PostgresOAuthStore } from "../infrastructure/persistence/oauth-store.js";
import { CimdClient } from "../infrastructure/oauth/cimd-client.js";
import type pg from "pg";
import type {
  AuthorizedRepositories,
  AuthorizedUnitOfWorkPort,
} from "../domain/ports/authorized-unit-of-work.port.js";
import {
  PostgresAuthorizedUnitOfWork,
  MemoryAuthorizedUnitOfWork,
  authorizedRepositories,
} from "../infrastructure/persistence/authorized-unit-of-work.js";
import { createDrizzleRepositories } from "../infrastructure/persistence/drizzle/repositories.js";
import { consumerAuthorizedGateway } from "../infrastructure/plug-server/consumer-authorized-gateway.js";

export interface Composition {
  app: ReturnType<typeof createExpressApp>["app"];
  logger: LoggerPort;
  useCases: ToolUseCases;
  operationsWorker?: OperacoesWorker;
  purgeExpiredCandidates: () => Promise<number>;
  close: () => Promise<void>;
}

export interface ComposeOverrides {
  plug?: PlugServerGatewayPort;
  logger?: LoggerPort;
  oauthClient?: OAuthClientPort;
}

export const compose = async (
  config: AppConfig,
  overrides: ComposeOverrides = {},
): Promise<Composition> => {
  const pino =
    overrides.logger === undefined
      ? createPino(config.LOG_LEVEL, config.NODE_ENV !== "production")
      : undefined;
  const logger = overrides.logger ?? new PinoLoggerAdapter(pino!);
  const crypto = new NodeCryptoAdapter(
    config.MCP_ENCRYPTION_KEY,
    config.MCP_ENCRYPTION_KEY_ID,
    config.MCP_ENCRYPTION_PREVIOUS_KEYS,
    config.MCP_ENCRYPTION_LEGACY_KEY,
  );
  const setup = new SetupCodeStore();
  const disposers: (() => Promise<void> | void)[] = [];

  let usuarios: AuthorizedRepositories["usuarios"];
  let acessos: AuthorizedRepositories["acessos"];
  let grafo: AuthorizedRepositories["grafo"];
  let skills: AuthorizedRepositories["skills"];
  let anotacoes: AuthorizedRepositories["anotacoes"];
  let audit: AuthorizedRepositories["audit"];
  let aprendizado: AuthorizedRepositories["aprendizado"];
  let setupOperationsStore: AuthorizedRepositories["setup"];
  let treinamentoRepo: AuthorizedRepositories["treinamento"];
  let publicacoes: AuthorizedRepositories["publicacoes"];
  let operacoes: AuthorizedRepositories["operacoes"];
  let readinessCheck: (() => Promise<boolean>) | undefined;
  let dbPool: pg.Pool | undefined;
  const oauthPolicy: OAuthPolicy = {
    issuer: config.PUBLIC_BASE_URL,
    resource: `${config.PUBLIC_BASE_URL}/mcp/chatgpt`,
    accesses: config.CHATGPT_OAUTH_ACCESS_IDS,
    clients: config.CHATGPT_OAUTH_CLIENTS,
  };

  if (config.DATABASE_URL) {
    const { db, pool } = createDb(config.DATABASE_URL);
    dbPool = pool;
    usuarios = new DrizzleUsuarioRepository(db);
    acessos = new DrizzleAcessoRepository(db);
    grafo = new DrizzleGrafoRepository(db);
    skills = new DrizzleSkillRepository(db);
    treinamentoRepo = new DrizzleTreinamentoRepository(db);
    publicacoes = new DrizzleSkillPublicacaoRepository(db);
    anotacoes = new DrizzleAnotacaoGrafoRepository(db);
    audit = new DrizzleAuditLog(db);
    aprendizado = new DrizzleAprendizadoRepository(db);
    setupOperationsStore = new DrizzleSetupOperations(db);
    operacoes = new DrizzleOperacoesRepository(db);
    disposers.push(async () => {
      await pool.end();
    });
  } else {
    usuarios = new InMemoryUsuarioRepository();
    acessos = new InMemoryAcessoRepository();
    grafo = new InMemoryGrafoRepository();
    skills = new InMemorySkillRepository();
    treinamentoRepo = new MemoryTreinamentoRepository();
    publicacoes = new InMemorySkillPublicacaoRepository(skills);
    anotacoes = new InMemoryAnotacaoGrafoRepository();
    audit = new InMemoryAuditLog();
    aprendizado = new InMemoryAprendizadoRepository();
    setupOperationsStore = new MemorySetupOperations();
    operacoes = new InMemoryOperacoesRepository();
  }

  const oauthStore: OAuthStorePort | undefined = config.CHATGPT_OAUTH_ENABLED
    ? dbPool
      ? new PostgresOAuthStore(dbPool)
      : new MemoryOAuthStore(acessos)
    : undefined;
  const oauth = oauthStore
    ? new ChatGptOAuth(
        oauthStore,
        crypto,
        acessos,
        overrides.oauthClient ?? new CimdClient(config.CHATGPT_OAUTH_CLIENTS),
        oauthPolicy,
        (verifier) => createHash("sha256").update(verifier).digest("base64url"),
      )
    : undefined;
  const baseRepositories: AuthorizedRepositories = {
    usuarios,
    acessos,
    grafo,
    skills,
    anotacoes,
    audit,
    aprendizado,
    setup: setupOperationsStore,
    treinamento: treinamentoRepo,
    publicacoes,
    operacoes,
  };
  const unitOfWork: AuthorizedUnitOfWorkPort | undefined = oauthStore
    ? dbPool
      ? new PostgresAuthorizedUnitOfWork(dbPool, oauthPolicy, createDrizzleRepositories)
      : new MemoryAuthorizedUnitOfWork(baseRepositories, oauthStore, oauthPolicy)
    : undefined;
  if (unitOfWork) {
    const repositories = authorizedRepositories(baseRepositories, unitOfWork);
    ({ usuarios, acessos, grafo, skills, anotacoes, audit, aprendizado, publicacoes, operacoes } =
      repositories);
    setupOperationsStore = repositories.setup;
    treinamentoRepo = repositories.treinamento;
  }
  if (oauthStore) {
    try {
      await oauth?.reconcile();
    } catch (error) {
      for (const disposer of [...disposers].reverse()) await disposer();
      throw error;
    }
    const cleanup = setInterval(() => {
      void oauth
        ?.reconcile()
        .then(() => oauthStore.purgeExpired(Date.now()))
        .catch(() => logger.warn("OAuth cleanup unavailable"));
    }, 60_000);
    cleanup.unref();
    disposers.push(() => clearInterval(cleanup));
  }
  let mcpRateLimitStore: RateLimitStore = new MemoryRateLimitStore();
  let policyKv:
    | {
        get(key: string): Promise<string | null>;
        set(key: string, value: string, options: { PX: number }): Promise<unknown>;
      }
    | undefined;
  let queryCache: QueryResultCachePort = new MemoryQueryResultCache();
  let querySingleflight: QuerySingleflightPort = new MemoryQuerySingleflight();
  if (config.REDIS_URL.length > 0) {
    const { createClient } = await import("redis");
    const redis = createClient({
      url: config.REDIS_URL,
      ...(config.CHATGPT_OAUTH_ENABLED
        ? { socket: { connectTimeout: 5000, reconnectStrategy: false }, disableOfflineQueue: true }
        : {}),
    });
    redis.on("error", () => logger.warn("Redis unavailable"));
    try {
      await redis.connect();
      mcpRateLimitStore = new RedisRateLimitStore(
        redis,
        config.CHATGPT_OAUTH_ENABLED ? new MemoryRateLimitStore() : undefined,
      );
      policyKv = redis;
      queryCache = new RedisQueryResultCache(redis);
      querySingleflight = new RedisQuerySingleflight(
        redis,
        config.QUERY_CACHE_SINGLEFLIGHT_LEASE_MS,
        config.QUERY_CACHE_SINGLEFLIGHT_WAIT_MS,
      );
      disposers.push(async () => {
        if (redis.isOpen) await redis.quit();
      });
    } catch (error) {
      if (redis.isOpen) redis.destroy();
      if (!config.CHATGPT_OAUTH_ENABLED) throw error;
      logger.warn("Redis unavailable at startup; using local quotas and cache");
    }
  }

  let plugInner: PlugServerGatewayPort;
  if (overrides.plug) {
    plugInner = overrides.plug;
  } else {
    const hubAgents = createHubHttpAgents();
    disposers.push(() => {
      destroyHubHttpAgents(hubAgents);
    });
    plugInner = new PlugServerRestAdapter(
      config.PLUG_SERVER_BASE_URL,
      logger,
      {
        sql: createPooledFetch(hubAgents.sql),
        auth: createPooledFetch(hubAgents.auth),
      },
      config.PLUG_SERVER_HTTP_TIMEOUT_MS,
    );
  }
  const plug = consumerAuthorizedGateway(
    overrides.plug ? plugInner : new CachedPlugGateway(plugInner, { kv: policyKv }),
  );
  const sessions = new UsuarioTokenManager(usuarios, crypto, plug, logger);
  const anexoHandles = new MemoryAnexoHandleStore(config.MCP_ENCRYPTION_KEY, undefined, undefined, {
    acessoBytes: config.ANEXO_MAX_BYTES_PER_ACCESS,
    processoBytes: config.ANEXO_MAX_BYTES_PROCESS,
  });
  const anexoConverter = new SharpPdfkitAnexoConverter();
  const destinosWebhook = new PublicHttpsWebhookDestination();
  const monitorOperacoes = new MonitorOperacoes(acessos, audit, anotacoes, operacoes, {
    janelaMs: config.OPERATIONS_SLO_WINDOW_MINUTES * 60_000,
    minObservacoes: config.OPERATIONS_SLO_MIN_OBSERVATIONS,
    erroAtencao: config.OPERATIONS_SLO_ERROR_WARNING_PERCENT / 100,
    erroCritica: config.OPERATIONS_SLO_ERROR_CRITICAL_PERCENT / 100,
    p95AtencaoMs: config.OPERATIONS_SLO_P95_WARNING_MS,
    p95CriticaMs: config.OPERATIONS_SLO_P95_CRITICAL_MS,
    truncamentoAtencao: config.OPERATIONS_SLO_TRUNCATION_WARNING_PERCENT / 100,
  });
  const operationsWorker = new OperacoesWorker(
    monitorOperacoes,
    operacoes,
    crypto,
    logger,
    destinosWebhook,
    {
      timeoutMs: config.OPERATIONS_WEBHOOK_TIMEOUT_MS,
      leaseMs: config.OPERATIONS_WEBHOOK_LEASE_MS,
    },
  );

  const useCases: ToolUseCases = {
    treinamento: new Treinamento(acessos, skills, grafo, aprendizado, treinamentoRepo, audit),
    registrarAcesso: new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      setup,
      config.PUBLIC_BASE_URL,
      config.MCP_TOKEN_TTL_DAYS,
      sessions,
      logger,
    ),
    adicionarAcesso: new AdicionarAcesso(
      acessos,
      plug,
      sessions,
      crypto,
      setup,
      config.PUBLIC_BASE_URL,
      config.MCP_TOKEN_TTL_DAYS,
      logger,
    ),
    listarAcessos: new ListarAcessos(acessos),
    verificarAcesso: new VerificarAcesso(acessos, plug, sessions, crypto, logger),
    removerAcesso: new RemoverAcesso(
      acessos,
      {
        grafo,
        skills,
        anotacoes,
        aprendizado,
      },
      unitOfWork,
    ),
    atualizarCredencialPlug: new AtualizarCredencialPlug(usuarios, sessions, plug, crypto),
    rotacionarTokenMcp: new RotacionarTokenMcp(
      acessos,
      crypto,
      setup,
      config.PUBLIC_BASE_URL,
      config.MCP_TOKEN_TTL_DAYS,
    ),
    atualizarDialeto: new AtualizarDialeto(acessos, grafo, skills),
    atualizarPersona: new AtualizarPersona(acessos),
    treinarComSql: new TreinarComSql(acessos, grafo, plug, sessions, crypto, audit, skills, {
      cache: queryCache,
      schemaDriftEnabled: config.MCP_SCHEMA_DRIFT_ENABLED,
    }),
    consultarDados: new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      config.QUERY_DEFAULT_MAX_ROWS,
      config.QUERY_ABSOLUTE_MAX_ROWS,
      {
        grafo,
        aprendizado,
        anotacoes,
        cache: queryCache,
        singleflight: querySingleflight,
        cacheTtlMs: config.QUERY_CACHE_TTL_MS,
        semanticQueryEnabled: config.MCP_SEMANTIC_QUERY_ENABLED,
        timingsSamplePercent: config.PLUG_SERVER_TIMINGS_SAMPLE_PERCENT,
        anexos: anexoHandles,
      },
    ),
    explorarTabelas: new ExplorarTabelas(acessos, plug, sessions, crypto, audit),
    mapearTabela: new MapearTabela(acessos, grafo, plug, sessions, crypto, {
      skills,
      cache: queryCache,
      schemaDriftEnabled: config.MCP_SCHEMA_DRIFT_ENABLED,
    }),
    buscarContexto: new BuscarContexto(
      acessos,
      grafo,
      skills,
      anotacoes,
      plug,
      sessions,
      crypto,
      aprendizado,
      audit,
      logger,
    ),
    resolverConflito: new ResolverConflito(acessos, grafo),
    listarConflitos: new ListarConflitos(acessos, grafo),
    validarConsulta: new ValidarConsulta(acessos, skills, plug, sessions, crypto, {
      defaultMaxRows: config.QUERY_DEFAULT_MAX_ROWS,
      absoluteMaxRows: config.QUERY_ABSOLUTE_MAX_ROWS,
      grafo,
      audit,
      timingsSamplePercent: config.PLUG_SERVER_TIMINGS_SAMPLE_PERCENT,
    }),
    criarSkill: new CriarSkill(acessos, skills, grafo),
    atualizarSkill: new AtualizarSkill(acessos, skills, grafo),
    validarSkill: new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo),
    publicarSkill: new PublicarSkill(
      acessos,
      skills,
      grafo,
      publicacoes,
      crypto,
      anotacoes,
      treinamentoRepo,
    ),
    despublicarSkill: new DespublicarSkill(acessos, skills, grafo),
    removerSkill: new RemoverSkill(acessos, skills, aprendizado),
    listarSkills: new ListarSkills(acessos, skills, grafo),
    listarSqlModelos: new ListarSqlModelos(acessos, skills, grafo),
    obterSkill: new ObterSkill(
      acessos,
      skills,
      grafo,
      anotacoes,
      plug,
      sessions,
      crypto,
      aprendizado,
    ),
    expandirEscopo: new ExpandirEscopo(acessos, skills, grafo),
    confirmarRelacionamento: new ConfirmarRelacionamento(acessos, grafo, skills),
    removerRelacionamento: new RemoverRelacionamento(acessos, grafo, skills),
    confirmarColuna: new ConfirmarColuna(acessos, grafo, skills),
    anotarGrafo: new AnotarGrafo(acessos, grafo, anotacoes, skills),
    listarAnotacoes: new ListarAnotacoes(acessos, anotacoes),
    atualizarAnotacao: new AtualizarAnotacao(acessos, anotacoes),
    removerAnotacao: new RemoverAnotacao(acessos, anotacoes),
    salvarConsulta: new SalvarConsulta(acessos, skills, aprendizado, grafo),
    registrarAprendizado: new RegistrarAprendizado(acessos, grafo, anotacoes, aprendizado, skills),
    atualizarEscopoPadrao: new AtualizarEscopoPadrao(acessos),
    herdarCatalogo: new HerdarCatalogo(acessos, grafo),
    listarAuditoria: new ListarAuditoria(acessos, audit),
    listarMetricasAgente: new ListarMetricasAgente(acessos, audit),
    listarAlertasOperacionais: new ListarAlertasOperacionais(acessos, operacoes),
    reconhecerAlertaOperacional: new ReconhecerAlertaOperacional(acessos, operacoes),
    configurarWebhookOperacional: new ConfigurarWebhookOperacional(
      acessos,
      operacoes,
      crypto,
      destinosWebhook,
    ),
    rearmarWebhookOperacional: new RearmarWebhookOperacional(acessos, operacoes),
    registrarLacunaFerramenta: new RegistrarLacunaFerramenta(acessos, aprendizado),
    listarLacunas: new ListarLacunas(acessos, aprendizado),
    inspecionarConsulta: new InspecionarConsulta(
      acessos,
      skills,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
      { anexos: anexoHandles },
    ),
    exportarAnexo: new ExportarAnexo(
      acessos,
      skills,
      anexoHandles,
      anexoConverter,
      plug,
      sessions,
      crypto,
      audit,
      logger,
      grafo,
    ),
    descobrirTabela: new DescobrirTabela(acessos, skills, grafo, plug, sessions, crypto),
    detectarDerivaEsquema: new DetectarDerivaEsquema(
      acessos,
      grafo,
      skills,
      queryCache,
      aprendizado,
    ),
    cancelarOperacao: new CancelarOperacao(),
  };

  if (dbPool) {
    const pool = dbPool;
    readinessCheck = async () => {
      await pool.query("select 1");
      return true;
    };
  }

  useCases.setupOperations = new SetupOperations(
    setupOperationsStore,
    crypto,
    acessos,
    usuarios,
    plug,
    sessions,
    config.PUBLIC_BASE_URL,
    async (purpose, uid, form) => {
      if (purpose === "credenciais") {
        await useCases.atualizarCredencialPlug.execute(uid, form);
        return {};
      }
      const result: { setupCode?: string; acessoId?: string; acesso?: { id: string } } =
        purpose === "registrar"
          ? await useCases.registrarAcesso.execute({
              ...form,
              recuperarAcesso: form.recuperar === "sim",
            })
          : purpose === "adicionar"
            ? await useCases.adicionarAcesso.execute(uid, form)
            : await useCases.rotacionarTokenMcp.execute(uid, form.expectedBearerHash);
      const token = result.setupCode ? setup.consume(result.setupCode) : null;
      if (!token) {
        throw new Error("Browser delivery unavailable");
      }
      return { token, acessoId: result.acessoId ?? result.acesso?.id };
    },
    async (acessoId) => {
      anexoHandles.invalidateAcesso(acessoId);
      try {
        await queryCache.deleteByPrefix(`mcp:query:acesso:${acessoId}:`);
      } catch {
        logger.warn(
          "Cache indisponível durante invalidação; autorização permanece revalidada a cada entrega",
          { acessoId },
        );
      }
    },
    oauth,
  );

  const { app, dispose } = createExpressApp({
    config,
    logger,
    useCases,
    acessos,
    skills,
    crypto,
    setup,
    pino,
    mcpRateLimitStore,
    readinessCheck,
    oauth,
  });
  disposers.push(dispose);

  return {
    app,
    logger,
    useCases,
    operationsWorker,
    purgeExpiredCandidates: () =>
      aprendizado.purgeCandidatasAntesDe(new Date(Date.now() - 90 * 86400_000)),
    close: async () => {
      for (const disposer of [...disposers].reverse()) {
        await disposer();
      }
    },
  };
};
