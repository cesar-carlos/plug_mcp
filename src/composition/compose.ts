import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { AppConfig } from "../config/env.js";
import { ConectarAmbiente } from "../application/use-cases/conectar-ambiente.js";
import { ConfigurarClientToken } from "../application/use-cases/configurar-client-token.js";
import { ConsultarDados } from "../application/use-cases/consultar-dados.js";
import { AutenticarConta, RegistrarConta } from "../application/use-cases/conta.js";
import { AdicionarRelacionamento } from "../application/use-cases/adicionar-relacionamento.js";
import { AnotarFonte } from "../application/use-cases/anotar-fonte.js";
import { AtualizarFonte } from "../application/use-cases/atualizar-fonte.js";
import { BuscarContexto } from "../application/use-cases/buscar-contexto.js";
import { DesconectarAmbiente } from "../application/use-cases/desconectar-ambiente.js";
import { DescreverTabela } from "../application/use-cases/descrever-tabela.js";
import { ExplorarTabelas } from "../application/use-cases/explorar-tabelas.js";
import { ListarAmbientes } from "../application/use-cases/listar-ambientes.js";
import { ListarAnotacoes } from "../application/use-cases/listar-anotacoes.js";
import { ListarFontes } from "../application/use-cases/listar-fontes.js";
import { ObterFonte } from "../application/use-cases/obter-fonte.js";
import { RegistrarFonte } from "../application/use-cases/registrar-fonte.js";
import { RemoverAnotacao } from "../application/use-cases/remover-anotacao.js";
import { RemoverFonte } from "../application/use-cases/remover-fonte.js";
import { SalvarConsulta } from "../application/use-cases/salvar-consulta.js";
import { TestarSql } from "../application/use-cases/testar-sql.js";
import { VerificarStatusAmbiente } from "../application/use-cases/verificar-status-ambiente.js";
import type { AmbienteRepositoryPort } from "../domain/ports/ambiente-repository.port.js";
import type { AnotacaoRepositoryPort } from "../domain/ports/anotacao-repository.port.js";
import type { AuditLogPort } from "../domain/ports/audit-log.port.js";
import type { CatalogoRepositoryPort } from "../domain/ports/catalogo-repository.port.js";
import type { ContaRepositoryPort } from "../domain/ports/conta-repository.port.js";
import type { IndiceContextoPort } from "../domain/ports/indice-contexto.port.js";
import type { LoggerPort } from "../domain/ports/logger.port.js";
import type { MemoriaConsultaRepositoryPort } from "../domain/ports/memoria-consulta-repository.port.js";
import type { PlugServerGatewayPort } from "../domain/ports/plug-server-gateway.port.js";
import { NodeCryptoAdapter } from "../infrastructure/crypto/node-crypto.adapter.js";
import { HttpEmbeddingAdapter } from "../infrastructure/embedding/http-embedding.adapter.js";
import { createExpressApp } from "../infrastructure/http/create-app.js";
import { MemoryRateLimitStore, type RateLimitStore } from "../infrastructure/http/rate-limit.js";
import { RedisRateLimitStore } from "../infrastructure/http/redis-rate-limit.store.js";
import { createPino, PinoLoggerAdapter } from "../infrastructure/logging/pino-logger.adapter.js";
import type { ToolUseCases } from "../infrastructure/mcp/register-tools.js";
import { McpJwtService } from "../infrastructure/oauth/jwt.js";
import { DrizzleOAuthStore } from "../infrastructure/oauth/drizzle-oauth-store.js";
import { InMemoryOAuthStore } from "../infrastructure/oauth/memory-oauth-store.js";
import type { OAuthStorePort } from "../infrastructure/oauth/oauth-store.port.js";
import {
  DrizzleAnotacaoRepository,
  DrizzleIndiceContexto,
  DrizzleIndicePgvector,
  DrizzleMemoriaConsultaRepository,
} from "../infrastructure/persistence/drizzle/drizzle-contexto.js";
import {
  DrizzleAmbienteRepository,
  DrizzleAuditLog,
  DrizzleCatalogoRepository,
  DrizzleContaRepository,
  type Db,
} from "../infrastructure/persistence/drizzle/drizzle-repos.js";
import {
  InMemoryAmbienteRepository,
  InMemoryAnotacaoRepository,
  InMemoryAuditLog,
  InMemoryCatalogoRepository,
  InMemoryContaRepository,
  InMemoryIndiceContexto,
  InMemoryMemoriaConsultaRepository,
} from "../infrastructure/persistence/memory/memory-repos.js";
import * as schema from "../infrastructure/persistence/schema.js";
import { PlugServerRestAdapter } from "../infrastructure/plug-server/plug-server-rest.adapter.js";
import { ServiceTokenManager } from "../infrastructure/plug-server/token-manager.js";

export interface Composition {
  app: ReturnType<typeof createExpressApp>["app"];
  logger: LoggerPort;
  useCases: ToolUseCases;
  contas: ContaRepositoryPort;
  ambientes: AmbienteRepositoryPort;
  catalogo: CatalogoRepositoryPort;
  close: () => Promise<void>;
}

export interface ComposeOverrides {
  plug?: PlugServerGatewayPort;
  contas?: ContaRepositoryPort;
  ambientes?: AmbienteRepositoryPort;
  catalogo?: CatalogoRepositoryPort;
  anotacoes?: AnotacaoRepositoryPort;
  memoria?: MemoriaConsultaRepositoryPort;
  indice?: IndiceContextoPort;
  audit?: AuditLogPort;
  oauthStore?: OAuthStorePort;
  logger?: LoggerPort;
  fetchImpl?: typeof fetch;
}

export const compose = async (
  inputConfig: AppConfig,
  overrides: ComposeOverrides = {},
): Promise<Composition> => {
  const pino =
    overrides.logger === undefined
      ? createPino(inputConfig.LOG_LEVEL, inputConfig.NODE_ENV !== "production")
      : undefined;
  const logger = overrides.logger ?? new PinoLoggerAdapter(pino!);
  const crypto = new NodeCryptoAdapter(inputConfig.MCP_ENCRYPTION_KEY);

  const disposers: (() => Promise<void> | void)[] = [];
  let contas = overrides.contas;
  let ambientes = overrides.ambientes;
  let catalogo = overrides.catalogo;
  let anotacoes = overrides.anotacoes;
  let memoria = overrides.memoria;
  let indice = overrides.indice;
  let audit = overrides.audit;
  let oauthStore = overrides.oauthStore;

  if (
    !contas ||
    !ambientes ||
    !catalogo ||
    !anotacoes ||
    !memoria ||
    !indice ||
    !audit ||
    !oauthStore
  ) {
    if (inputConfig.DATABASE_URL && inputConfig.NODE_ENV !== "test") {
      const pool = new pg.Pool({ connectionString: inputConfig.DATABASE_URL });
      const db: Db = drizzle(pool, { schema });
      contas ??= new DrizzleContaRepository(db);
      ambientes ??= new DrizzleAmbienteRepository(db);
      catalogo ??= new DrizzleCatalogoRepository(db);
      anotacoes ??= new DrizzleAnotacaoRepository(db);
      memoria ??= new DrizzleMemoriaConsultaRepository(db);
      const fts = new DrizzleIndiceContexto(db);
      if (!indice) {
        if (inputConfig.EMBEDDING_API_URL.length > 0) {
          indice = new DrizzleIndicePgvector(
            db,
            new HttpEmbeddingAdapter(
              inputConfig.EMBEDDING_API_URL,
              inputConfig.EMBEDDING_API_KEY,
              inputConfig.EMBEDDING_MODEL,
              inputConfig.EMBEDDING_DIMENSIONS,
              overrides.fetchImpl ?? fetch,
            ),
            fts,
          );
        } else {
          indice = fts;
        }
      }
      audit ??= new DrizzleAuditLog(db);
      oauthStore ??= new DrizzleOAuthStore(db);
      disposers.push(async () => {
        await pool.end();
      });
    } else {
      const memCatalogo = new InMemoryCatalogoRepository();
      const memAnotacoes = new InMemoryAnotacaoRepository();
      const memMemoria = new InMemoryMemoriaConsultaRepository();
      contas ??= new InMemoryContaRepository();
      ambientes ??= new InMemoryAmbienteRepository();
      catalogo ??= memCatalogo;
      anotacoes ??= memAnotacoes;
      memoria ??= memMemoria;
      indice ??= new InMemoryIndiceContexto(
        catalogo instanceof InMemoryCatalogoRepository ? catalogo : memCatalogo,
        anotacoes instanceof InMemoryAnotacaoRepository ? anotacoes : memAnotacoes,
        memoria instanceof InMemoryMemoriaConsultaRepository ? memoria : memMemoria,
      );
      audit ??= new InMemoryAuditLog();
      oauthStore ??= new InMemoryOAuthStore();
    }
  }

  if (
    !contas ||
    !ambientes ||
    !catalogo ||
    !anotacoes ||
    !memoria ||
    !indice ||
    !audit ||
    !oauthStore
  ) {
    throw new Error("composition failed to wire persistence");
  }

  await catalogo.seedIfEmpty();

  const store = oauthStore;
  const auditLog = audit;
  const cleanupTimer = setInterval(() => {
    const cutoff = new Date(
      Date.now() - inputConfig.AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    void store.purgeExpired().catch((error: unknown) => {
      logger.warn("oauth purge failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    void auditLog.purgeOlderThan(cutoff).catch((error: unknown) => {
      logger.warn("audit purge failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    const memoriaCutoff = new Date(
      Date.now() - inputConfig.CONSULTA_MEMORIA_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    void memoria.purgeOlderThan(memoriaCutoff).catch((error: unknown) => {
      logger.warn("consulta memoria purge failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, inputConfig.OAUTH_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  disposers.push(() => {
    clearInterval(cleanupTimer);
  });

  let devAccountId: string | undefined;
  if (inputConfig.MCP_DEV_BEARER_TOKEN) {
    const existing = await contas.findByEmail("dev@localhost");
    const account =
      existing ??
      (await contas.insert("dev@localhost", await crypto.hashPassword("dev-only-do-not-use")));
    devAccountId = account.id;
  }
  const config: AppConfig = { ...inputConfig, devAccountId };

  const plug =
    overrides.plug ??
    new PlugServerRestAdapter(
      config.PLUG_SERVER_BASE_URL,
      new ServiceTokenManager(
        config.PLUG_SERVER_BASE_URL,
        config.PLUG_SERVER_CLIENT_EMAIL,
        config.PLUG_SERVER_CLIENT_PASSWORD,
        logger,
        overrides.fetchImpl,
        config.PLUG_SERVER_HTTP_TIMEOUT_MS,
      ),
      logger,
      overrides.fetchImpl,
      config.PLUG_SERVER_HTTP_TIMEOUT_MS,
    );

  const useCases: ToolUseCases = {
    listarAmbientes: new ListarAmbientes(ambientes),
    conectarAmbiente: new ConectarAmbiente(ambientes, plug),
    configurarClientToken: new ConfigurarClientToken(ambientes, plug, crypto),
    verificarStatusAmbiente: new VerificarStatusAmbiente(ambientes, plug),
    listarFontes: new ListarFontes(ambientes, catalogo),
    obterFonte: new ObterFonte(ambientes, catalogo, anotacoes),
    consultarDados: new ConsultarDados(
      ambientes,
      plug,
      crypto,
      audit,
      config.QUERY_DEFAULT_MAX_ROWS,
      config.QUERY_ABSOLUTE_MAX_ROWS,
    ),
    desconectarAmbiente: new DesconectarAmbiente(ambientes, plug, audit, logger),
    registrarFonte: new RegistrarFonte(ambientes, catalogo, plug, crypto, audit),
    atualizarFonte: new AtualizarFonte(ambientes, catalogo, plug, crypto, audit),
    removerFonte: new RemoverFonte(ambientes, catalogo, audit),
    explorarTabelas: new ExplorarTabelas(ambientes, plug, crypto, audit),
    descreverTabela: new DescreverTabela(ambientes, plug, crypto, audit),
    testarSql: new TestarSql(ambientes, plug, crypto, audit),
    anotarFonte: new AnotarFonte(ambientes, catalogo, anotacoes, indice, audit, logger),
    adicionarRelacionamento: new AdicionarRelacionamento(ambientes, catalogo, audit),
    removerAnotacao: new RemoverAnotacao(ambientes, anotacoes, audit),
    listarAnotacoes: new ListarAnotacoes(ambientes, catalogo, anotacoes),
    salvarConsulta: new SalvarConsulta(ambientes, catalogo, memoria, indice, audit, logger),
    buscarContexto: new BuscarContexto(ambientes, indice),
  };

  const jwt = new McpJwtService(config);
  const registrar = new RegistrarConta(contas, crypto);
  const autenticar = new AutenticarConta(contas, crypto);

  let mcpRateLimitStore: RateLimitStore = new MemoryRateLimitStore();
  if (config.REDIS_URL.length > 0) {
    const { createClient } = await import("redis");
    const redis = createClient({ url: config.REDIS_URL });
    await redis.connect();
    mcpRateLimitStore = new RedisRateLimitStore(redis);
    disposers.push(async () => {
      await redis.quit();
    });
  }

  const { app, dispose } = createExpressApp({
    config,
    logger,
    jwt,
    useCases,
    pino,
    oauth: { config, store: oauthStore, jwt, crypto, registrar, autenticar },
    mcpRateLimitStore,
  });
  disposers.push(dispose);

  const close = async (): Promise<void> => {
    for (const disposer of [...disposers].reverse()) {
      await disposer();
    }
  };

  return { app, logger, useCases, contas, ambientes, catalogo, close };
};
