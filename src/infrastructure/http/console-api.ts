import { Router, type Express, type NextFunction, type Request, type Response } from "express";
import type { AppConfig } from "../../config/env.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { SetupPurpose } from "../../domain/ports/setup-operation.port.js";
import { sessionContext, type SessionStore } from "../../application/session-context.js";
import { isMcpTokenExpired, readBearer } from "../mcp/mcp-auth.js";
import type { ToolUseCases } from "../mcp/register-tools.js";
import { createRateLimiter, mcpRateLimitKey, type RateLimitStore } from "./rate-limit.js";
import { sendCaughtError, sendDomainError } from "./console-errors.js";

export const camposDoSetup = (purpose: SetupPurpose): readonly string[] => {
  const campos = ["email", "senha", "confirmado", "csrf"];
  if (purpose === "registrar" || purpose === "adicionar") {
    campos.push("agentId", "dialeto", "clientToken", "nomeAmigavel");
  }
  if (purpose === "registrar") {
    campos.push("recuperar");
  }
  return campos;
};

const jsonBody = (req: Request): Record<string, unknown> => {
  const body: unknown = req.body;
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
};

const asArgs = <T>(body: Record<string, unknown>): T => body as T;

const routeParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const queryText = (req: Request, key: string): string | undefined => {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
};

const queryInt = (req: Request, key: string): number | undefined => {
  const raw = queryText(req, key);
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
};

const queryBool = (req: Request, key: string): boolean | undefined => {
  const raw = queryText(req, key);
  if (raw === "true" || raw === "sim") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return undefined;
};

export interface ConsoleApiInput {
  readonly config: AppConfig;
  readonly useCases: ToolUseCases;
  readonly acessos: AcessoRepositoryPort;
  readonly crypto: CryptoPort;
  readonly mcpRateLimitStore?: RateLimitStore;
}

export const registerConsoleApi = (app: Express, input: ConsoleApiInput): void => {
  const router = Router();
  const bootstrapLimiter = createRateLimiter({
    windowMs: input.config.MCP_RATE_LIMIT_WINDOW_MS,
    max: input.config.MCP_BOOTSTRAP_RATE_LIMIT_MAX,
    keyGenerator: (req) => `console:boot:${req.ip ?? "unknown"}`,
    store: input.mcpRateLimitStore,
  });
  const authLimiter = createRateLimiter({
    windowMs: input.config.MCP_RATE_LIMIT_WINDOW_MS,
    max: input.config.MCP_RATE_LIMIT_MAX,
    keyGenerator: mcpRateLimitKey,
    store: input.mcpRateLimitStore,
  });

  const resolveStore = async (req: Request): Promise<SessionStore | null> => {
    const token = readBearer(req);
    if (!token) {
      return null;
    }
    const acesso = await input.acessos.findByTokenHash(input.crypto.sha256Hex(token));
    if (!acesso || acesso.statusAcesso === "revoked" || isMcpTokenExpired(acesso)) {
      return null;
    }
    return {
      usuarioId: acesso.usuarioId,
      acessoId: acesso.id,
      clientIp: req.ip,
      auth: {
        kind: "manual",
        usuarioId: acesso.usuarioId,
        acessoId: acesso.id,
        sourceHash: acesso.tokenHash,
      },
    };
  };

  const requireSetup = (): NonNullable<ToolUseCases["setupOperations"]> => {
    if (!input.useCases.setupOperations) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Operação de navegador indisponível.",
        hint: "Configure o serviço de setup seguro.",
      });
    }
    return input.useCases.setupOperations;
  };

  const runPublic = (
    fn: (req: Request) => Promise<unknown>,
  ): ((req: Request, res: Response) => void) => {
    return (req, res) => {
      void fn(req)
        .then((result) => {
          res.json(result);
        })
        .catch((error: unknown) => {
          sendCaughtError(res, error);
        });
    };
  };

  const runAuth = (
    fn: (req: Request, uid: string) => Promise<unknown>,
  ): ((req: Request, res: Response) => void) => {
    return (req, res) => {
      void (async () => {
        const store = await resolveStore(req);
        const uid = store?.usuarioId;
        if (!store || !uid) {
          sendDomainError(res, DomainError.unauthenticated());
          return;
        }
        const result = await sessionContext.run(store, () => fn(req, uid));
        res.json(result);
      })().catch((error: unknown) => {
        sendCaughtError(res, error);
      });
    };
  };

  router.post(
    "/setup/registrar",
    bootstrapLimiter,
    runPublic(async () => requireSetup().begin("registrar")),
  );

  router.get(
    "/setup/:code",
    bootstrapLimiter,
    runPublic(async (req) => {
      const form = await requireSetup().form(routeParam(req.params.code));
      if (!form) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Operação inválida ou expirada.",
          hint: "Gere uma nova URL de operação e confirme no navegador.",
        });
      }
      return {
        purpose: form.purpose,
        csrf: form.csrf,
        campos: camposDoSetup(form.purpose),
        recuperar: form.purpose === "registrar",
      };
    }),
  );

  router.post(
    "/setup/adicionar",
    authLimiter,
    runAuth(async (_req, uid) => requireSetup().begin("adicionar", uid)),
  );
  router.post(
    "/setup/credenciais",
    authLimiter,
    runAuth(async (_req, uid) => requireSetup().begin("credenciais", uid)),
  );
  router.post(
    "/setup/rotacionar",
    authLimiter,
    runAuth(async (_req, uid) => requireSetup().begin("rotacionar", uid)),
  );

  router.get(
    "/acesso",
    authLimiter,
    runAuth(async (_req, uid) => input.useCases.listarAcessos.execute(uid)),
  );
  router.post(
    "/acesso/verificar",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.verificarAcesso.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/acesso/persona",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.atualizarPersona.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.post(
    "/acesso/escopo",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.atualizarEscopoPadrao.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.post(
    "/acesso/dialeto",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.atualizarDialeto.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.post(
    "/acesso/remover",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.removerAcesso.execute(uid, asArgs(jsonBody(req)))),
  );

  router.get(
    "/skills",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.listarSkills.execute(uid, asArgs(jsonBody(req)))),
  );
  router.get(
    "/skills/modelos",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.listarSqlModelos.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.get(
    "/skills/:id",
    authLimiter,
    runAuth(async (req, uid) => {
      const revisao = queryText(req, "revisao");
      return input.useCases.obterSkill.execute(uid, {
        skillId: routeParam(req.params.id),
        revisao: revisao === "publicada" || revisao === "rascunho" ? revisao : undefined,
      });
    }),
  );
  router.post(
    "/skills",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.criarSkill.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/skills/:id",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.atualizarSkill.execute(
        uid,
        asArgs({ ...jsonBody(req), skillId: routeParam(req.params.id) }),
      ),
    ),
  );
  router.post(
    "/skills/:id/validar",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.validarSkill.execute(
        uid,
        asArgs({ ...jsonBody(req), skillId: routeParam(req.params.id) }),
      ),
    ),
  );
  router.post(
    "/skills/:id/publicar",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.publicarSkill.execute(
        uid,
        asArgs({ ...jsonBody(req), skillId: routeParam(req.params.id) }),
      ),
    ),
  );
  router.post(
    "/skills/:id/despublicar",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.despublicarSkill.execute(
        uid,
        asArgs({ ...jsonBody(req), skillId: routeParam(req.params.id) }),
      ),
    ),
  );
  router.post(
    "/skills/:id/remover",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.removerSkill.execute(
        uid,
        asArgs({ ...jsonBody(req), skillId: routeParam(req.params.id) }),
      ),
    ),
  );
  router.post(
    "/skills/:id/escopo",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.expandirEscopo.execute(
        uid,
        asArgs({ ...jsonBody(req), skillId: routeParam(req.params.id) }),
      ),
    ),
  );

  router.post(
    "/treino/sql",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.treinarComSql.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/treino/validar",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.validarConsulta.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/treino/inspecionar",
    authLimiter,
    runAuth(async (req, uid) => {
      if (!input.config.MCP_INSPECTION_ENABLED) {
        throw new DomainError({
          code: ERROR_CODES.FEATURE_DESLIGADA,
          message: "Tool inspecionar_consulta está desligada.",
          hint: "Desligue só para rollback. Religue a flag correspondente no servidor.",
        });
      }
      return input.useCases.inspecionarConsulta.execute(uid, asArgs(jsonBody(req)));
    }),
  );

  router.get(
    "/grafo/tabelas",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.explorarTabelas.execute(uid, { filtro: queryText(req, "filtro") }),
    ),
  );
  router.post(
    "/grafo/mapear",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.mapearTabela.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/grafo/coluna",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.confirmarColuna.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/grafo/relacionamento",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.confirmarRelacionamento.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.post(
    "/grafo/relacionamento/remover",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.removerRelacionamento.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.get(
    "/grafo/conflitos",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.listarConflitos.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/grafo/conflitos/resolver",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.resolverConflito.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.post(
    "/grafo/herdar",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.herdarCatalogo.execute(uid, asArgs(jsonBody(req)))),
  );

  router.get(
    "/anotacoes",
    authLimiter,
    runAuth(async (req, uid) => {
      const status = queryText(req, "status");
      return input.useCases.listarAnotacoes.execute(uid, {
        tabelaId: queryText(req, "tabelaId"),
        status: status === "vigente" || status === "obsoleta" ? status : undefined,
        somenteRevisaoPendente: queryBool(req, "somenteRevisaoPendente"),
        janelaRevisaoDias: queryInt(req, "janelaRevisaoDias"),
      });
    }),
  );
  router.post(
    "/anotacoes",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.anotarGrafo.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/anotacoes/:id",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.atualizarAnotacao.execute(
        uid,
        asArgs({ ...jsonBody(req), anotacaoId: routeParam(req.params.id) }),
      ),
    ),
  );
  router.post(
    "/anotacoes/:id/remover",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.removerAnotacao.execute(uid, { anotacaoId: routeParam(req.params.id) }),
    ),
  );

  router.get(
    "/consultas",
    authLimiter,
    runAuth(async (req, uid) => {
      if (!input.useCases.treinamento) {
        throw new DomainError({
          code: ERROR_CODES.FEATURE_DESLIGADA,
          message: "Consultas aprendidas indisponíveis.",
          hint: "O serviço de treinamento não está composto neste processo.",
        });
      }
      return input.useCases.treinamento.listarConsultas(uid, {
        skillId: queryText(req, "skillId"),
        estado: queryText(req, "estado"),
        pagina: queryInt(req, "pagina"),
        limite: queryInt(req, "limite"),
      });
    }),
  );
  router.get(
    "/consultas/:id",
    authLimiter,
    runAuth(async (req, uid) => {
      if (!input.useCases.treinamento) {
        throw new DomainError({
          code: ERROR_CODES.FEATURE_DESLIGADA,
          message: "Consultas aprendidas indisponíveis.",
          hint: "O serviço de treinamento não está composto neste processo.",
        });
      }
      return input.useCases.treinamento.obterConsulta(uid, routeParam(req.params.id));
    }),
  );
  router.post(
    "/consultas/salvar",
    authLimiter,
    runAuth(async (req, uid) => input.useCases.salvarConsulta.execute(uid, asArgs(jsonBody(req)))),
  );
  router.post(
    "/consultas/:id/inativar",
    authLimiter,
    runAuth(async (req, uid) => {
      if (!input.useCases.treinamento) {
        throw new DomainError({
          code: ERROR_CODES.FEATURE_DESLIGADA,
          message: "Consultas aprendidas indisponíveis.",
          hint: "O serviço de treinamento não está composto neste processo.",
        });
      }
      const body = jsonBody(req);
      return input.useCases.treinamento.inativarConsulta(uid, {
        consultaAprendidaId: routeParam(req.params.id),
        motivo: typeof body.motivo === "string" ? body.motivo : "",
        confirmadoPeloUsuario: body.confirmadoPeloUsuario === true,
        confirmacaoHash:
          typeof body.confirmacaoHash === "string" ? body.confirmacaoHash : undefined,
      });
    }),
  );
  router.post(
    "/aprendizado",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.registrarAprendizado.execute(uid, asArgs(jsonBody(req))),
    ),
  );

  router.get(
    "/auditoria",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.listarAuditoria.execute(uid, { limite: queryInt(req, "limite") }),
    ),
  );
  router.get(
    "/metricas",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.listarMetricasAgente.execute(uid, { limite: queryInt(req, "limite") }),
    ),
  );
  router.get(
    "/alertas",
    authLimiter,
    runAuth(async (req, uid) => {
      const status = queryText(req, "status");
      return input.useCases.listarAlertasOperacionais.execute(uid, {
        limite: queryInt(req, "limite"),
        status:
          status === "aberto" || status === "reconhecido" || status === "resolvido"
            ? status
            : undefined,
      });
    }),
  );
  router.post(
    "/alertas/:id/reconhecer",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.reconhecerAlertaOperacional.execute(uid, {
        alertaId: routeParam(req.params.id),
      }),
    ),
  );
  router.post(
    "/webhook",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.configurarWebhookOperacional.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.post(
    "/webhook/rearmar",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.rearmarWebhookOperacional.execute(uid, asArgs(jsonBody(req))),
    ),
  );
  router.get(
    "/lacunas",
    authLimiter,
    runAuth(async (req, uid) => {
      const status = queryText(req, "status");
      return input.useCases.listarLacunas.execute(uid, {
        limite: queryInt(req, "limite"),
        status: status === "aberta" || status === "arquivada" ? status : undefined,
      });
    }),
  );
  router.post(
    "/lacunas/ferramenta",
    authLimiter,
    runAuth(async (req, uid) =>
      input.useCases.registrarLacunaFerramenta.execute(uid, asArgs(jsonBody(req))),
    ),
  );

  router.use((_req: Request, res: Response, _next: NextFunction) => {
    sendDomainError(
      res,
      new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Rota do console inexistente.",
        hint: "Confira o caminho /app/api.",
      }),
    );
  });

  app.use("/app/api", router);
};
