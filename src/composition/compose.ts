import type { AppConfig } from "../config/env.js";
import {
  AdicionarAcesso,
  AtualizarCredencialPlug,
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
  MapearTabela,
  ResolverConflito,
} from "../application/use-cases/consultar.js";
import {
  AnotarGrafo,
  AtualizarSkill,
  ConfirmarColuna,
  CriarSkill,
  ListarAnotacoes,
  ListarSkills,
  ObterSkill,
  PublicarSkill,
  RemoverAnotacao,
  ValidarSkill,
} from "../application/use-cases/skills.js";
import { TreinarComSql } from "../application/use-cases/treinar-com-sql.js";
import type { LoggerPort } from "../domain/ports/logger.port.js";
import type { PlugServerGatewayPort } from "../domain/ports/plug-server-gateway.port.js";
import { NodeCryptoAdapter } from "../infrastructure/crypto/node-crypto.adapter.js";
import { createExpressApp } from "../infrastructure/http/create-app.js";
import { MemoryRateLimitStore, type RateLimitStore } from "../infrastructure/http/rate-limit.js";
import { RedisRateLimitStore } from "../infrastructure/http/redis-rate-limit.store.js";
import { SetupCodeStore } from "../infrastructure/http/setup-code-store.js";
import { createPino, PinoLoggerAdapter } from "../infrastructure/logging/pino-logger.adapter.js";
import type { ToolUseCases } from "../infrastructure/mcp/register-tools.js";
import { createDb } from "../infrastructure/persistence/drizzle/db.js";
import {
  DrizzleAcessoRepository,
  DrizzleAnotacaoGrafoRepository,
  DrizzleAuditLog,
  DrizzleGrafoRepository,
  DrizzleSkillRepository,
  DrizzleUsuarioRepository,
} from "../infrastructure/persistence/drizzle/drizzle-cofre.js";
import {
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryAuditLog,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../infrastructure/persistence/memory/memory-cofre.js";
import { CachedPlugGateway } from "../infrastructure/plug-server/policy-cache.js";
import { PlugServerRestAdapter } from "../infrastructure/plug-server/plug-server-rest.adapter.js";
import { UsuarioTokenManager } from "../infrastructure/plug-server/usuario-token-manager.js";

export interface Composition {
  app: ReturnType<typeof createExpressApp>["app"];
  logger: LoggerPort;
  useCases: ToolUseCases;
  close: () => Promise<void>;
}

export interface ComposeOverrides {
  plug?: PlugServerGatewayPort;
  logger?: LoggerPort;
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
  const crypto = new NodeCryptoAdapter(config.MCP_ENCRYPTION_KEY);
  const setup = new SetupCodeStore();
  const disposers: (() => Promise<void> | void)[] = [];

  let usuarios: InMemoryUsuarioRepository | DrizzleUsuarioRepository;
  let acessos: InMemoryAcessoRepository | DrizzleAcessoRepository;
  let grafo: InMemoryGrafoRepository | DrizzleGrafoRepository;
  let skills: InMemorySkillRepository | DrizzleSkillRepository;
  let anotacoes: InMemoryAnotacaoGrafoRepository | DrizzleAnotacaoGrafoRepository;
  let audit: InMemoryAuditLog | DrizzleAuditLog;

  if (config.DATABASE_URL) {
    const { db, pool } = createDb(config.DATABASE_URL);
    usuarios = new DrizzleUsuarioRepository(db);
    acessos = new DrizzleAcessoRepository(db);
    grafo = new DrizzleGrafoRepository(db);
    skills = new DrizzleSkillRepository(db);
    anotacoes = new DrizzleAnotacaoGrafoRepository(db);
    audit = new DrizzleAuditLog(db);
    disposers.push(async () => {
      await pool.end();
    });
  } else {
    usuarios = new InMemoryUsuarioRepository();
    acessos = new InMemoryAcessoRepository();
    grafo = new InMemoryGrafoRepository();
    skills = new InMemorySkillRepository();
    anotacoes = new InMemoryAnotacaoGrafoRepository();
    audit = new InMemoryAuditLog();
  }

  let mcpRateLimitStore: RateLimitStore = new MemoryRateLimitStore();
  let policyKv:
    | {
        get(key: string): Promise<string | null>;
        set(key: string, value: string, options: { PX: number }): Promise<unknown>;
      }
    | undefined;
  if (config.REDIS_URL.length > 0) {
    const { createClient } = await import("redis");
    const redis = createClient({ url: config.REDIS_URL });
    await redis.connect();
    mcpRateLimitStore = new RedisRateLimitStore(redis);
    policyKv = redis;
    disposers.push(async () => {
      await redis.quit();
    });
  }

  const plugInner =
    overrides.plug ?? new PlugServerRestAdapter(config.PLUG_SERVER_BASE_URL, logger);
  const plug = overrides.plug ? plugInner : new CachedPlugGateway(plugInner, { kv: policyKv });
  const sessions = new UsuarioTokenManager(usuarios, crypto, plug, logger);

  const useCases: ToolUseCases = {
    registrarAcesso: new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      setup,
      config.PUBLIC_BASE_URL,
      config.MCP_TOKEN_TTL_DAYS,
    ),
    adicionarAcesso: new AdicionarAcesso(acessos, plug, sessions, crypto),
    listarAcessos: new ListarAcessos(acessos),
    verificarAcesso: new VerificarAcesso(acessos, plug, sessions),
    removerAcesso: new RemoverAcesso(acessos),
    atualizarCredencialPlug: new AtualizarCredencialPlug(usuarios, sessions, plug, crypto),
    rotacionarTokenMcp: new RotacionarTokenMcp(
      usuarios,
      crypto,
      setup,
      config.PUBLIC_BASE_URL,
      config.MCP_TOKEN_TTL_DAYS,
    ),
    treinarComSql: new TreinarComSql(acessos, grafo, plug, sessions, crypto, audit),
    consultarDados: new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      config.QUERY_DEFAULT_MAX_ROWS,
      config.QUERY_ABSOLUTE_MAX_ROWS,
    ),
    explorarTabelas: new ExplorarTabelas(acessos, plug, sessions, crypto, audit),
    mapearTabela: new MapearTabela(acessos, grafo, plug, sessions, crypto),
    buscarContexto: new BuscarContexto(acessos, grafo, skills, anotacoes, plug, sessions, crypto),
    resolverConflito: new ResolverConflito(acessos, grafo),
    criarSkill: new CriarSkill(acessos, skills),
    atualizarSkill: new AtualizarSkill(acessos, skills),
    validarSkill: new ValidarSkill(acessos, skills, plug, sessions, crypto),
    publicarSkill: new PublicarSkill(acessos, skills),
    listarSkills: new ListarSkills(acessos, skills),
    obterSkill: new ObterSkill(acessos, skills),
    confirmarColuna: new ConfirmarColuna(acessos, grafo),
    anotarGrafo: new AnotarGrafo(acessos, grafo, anotacoes),
    listarAnotacoes: new ListarAnotacoes(acessos, anotacoes),
    removerAnotacao: new RemoverAnotacao(acessos, anotacoes),
  };

  const { app, dispose } = createExpressApp({
    config,
    logger,
    useCases,
    usuarios,
    acessos,
    skills,
    crypto,
    setup,
    pino,
    mcpRateLimitStore,
  });
  disposers.push(dispose);

  return {
    app,
    logger,
    useCases,
    close: async () => {
      for (const disposer of [...disposers].reverse()) {
        await disposer();
      }
    },
  };
};
