import { describe, expect, it } from "vitest";
import {
  ConfigurarWebhookOperacional,
  ListarAlertasOperacionais,
  MonitorOperacoes,
  RearmarWebhookOperacional,
} from "../../src/application/use-cases/operacoes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import {
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryAuditLog,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { InMemoryOperacoesRepository } from "../../src/infrastructure/persistence/memory/memory-operacoes.js";
import {
  MemoryQuerySingleflight,
  RedisQuerySingleflight,
} from "../../src/infrastructure/cache/query-singleflight.js";
import { PublicHttpsWebhookDestination } from "../../src/infrastructure/operacoes/webhook-destination.js";
import {
  assinaturaWebhook,
  OperacoesWorker,
} from "../../src/infrastructure/operacoes/webhook-worker.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => logger,
};
const monitorInerte = { executar: async () => undefined } as unknown as MonitorOperacoes;
const acesso = async () => {
  const repo = new InMemoryAcessoRepository();
  const row = await repo.create({
    usuarioId: "user-1",
    agentId: "11111111-1111-4111-8111-111111111111",
    dialeto: "postgres",
    nomeAmigavel: "Teste",
    clientTokenEnc: "enc",
    clientTokenHash: "client",
    tokenHash: "bearer",
    tokenExpiresAt: null,
    statusAcesso: "approved",
    timezone: "America/Cuiaba",
  });
  return { repo, row };
};

describe("operações proativas", () => {
  it("cria alerta SLO isolado por acesso somente com metadados agregados", async () => {
    const { repo, row } = await acesso();
    const audit = new InMemoryAuditLog();
    const anotacoes = new InMemoryAnotacaoGrafoRepository();
    const operacoes = new InMemoryOperacoesRepository();
    const agora = new Date();
    for (let i = 0; i < 20; i += 1)
      await audit.append({
        usuarioId: row.usuarioId,
        acessoId: row.id,
        tool: "consultar_dados",
        sqlEnviado: "skill:only",
        sucesso: i > 2,
        codigoErro: i > 2 ? null : "PLUG_SERVER_ERROR",
        linhasRetornadas: 1,
        duracaoMs: i > 2 ? 11_000 : 5_000,
        metadata: { origem: "modelo", truncated: i === 19 },
      });
    await new MonitorOperacoes(repo, audit, anotacoes, operacoes, {
      janelaMs: 60 * 60_000,
      minObservacoes: 20,
      erroAtencao: 0.05,
      erroCritica: 0.2,
      p95AtencaoMs: 10_000,
      p95CriticaMs: 30_000,
      truncamentoAtencao: 0.1,
    }).executar(agora);
    const result = await new ListarAlertasOperacionais(repo, operacoes).execute("user-1", {
      acessoId: row.id,
    });
    expect(result.alertas).toHaveLength(1);
    expect(result.alertas[0]).toMatchObject({
      categoria: "slo",
      severidade: "atencao",
      metadados: { observacoes: 20 },
    });
    expect(JSON.stringify(result)).not.toContain("skill:only");
    expect(JSON.stringify(result)).not.toContain("client");
  });

  it("cifra o webhook, exige confirmação e não devolve o segredo", async () => {
    const { repo, row } = await acesso();
    const operacoes = new InMemoryOperacoesRepository();
    const destinos = {
      validate: async (value: string) => new URL(value),
      resolve: async () => ({ address: "93.184.216.34", family: 4 as const }),
    };
    const useCase = new ConfigurarWebhookOperacional(repo, operacoes, crypto, destinos);
    await expect(
      useCase.execute("user-1", {
        acessoId: row.id,
        url: "https://events.example.test/hook",
        segredo: "0123456789abcdef",
        confirmadoPeloUsuario: false,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const result = await useCase.execute("user-1", {
      acessoId: row.id,
      url: "https://events.example.test/hook",
      segredo: "0123456789abcdef",
      confirmadoPeloUsuario: true,
    });
    expect(result).toEqual({ success: true, webhook: { ativo: true, configurado: true } });
    expect(JSON.stringify(result)).not.toContain("0123456789abcdef");
    expect((await operacoes.obterWebhook(row.id))?.urlEnc).not.toContain("events.example.test");
  });

  it("recusa destino privado antes de persistir", async () => {
    const { repo, row } = await acesso();
    const operacoes = new InMemoryOperacoesRepository();
    const useCase = new ConfigurarWebhookOperacional(
      repo,
      operacoes,
      crypto,
      new PublicHttpsWebhookDestination(),
    );
    await expect(
      useCase.execute("user-1", {
        acessoId: row.id,
        url: "https://127.0.0.1/hook",
        segredo: "0123456789abcdef",
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await operacoes.obterWebhook(row.id)).toBeNull();
  });

  it("não classifica todo o bloco 203/8 como reservado", async () => {
    const destino = new PublicHttpsWebhookDestination();
    await expect(destino.validate("https://203.1.2.3/hook")).resolves.toMatchObject({
      hostname: "203.1.2.3",
    });
  });

  it("não encerra um alerta SLO sem uma nova janela com amostra suficiente", async () => {
    const { repo, row } = await acesso();
    const audit = new InMemoryAuditLog();
    const anotacoes = new InMemoryAnotacaoGrafoRepository();
    const operacoes = new InMemoryOperacoesRepository();
    const agora = new Date();
    await operacoes.upsertAlerta({
      acessoId: row.id,
      categoria: "slo",
      severidade: "atencao",
      fingerprint: "janela-consulta",
      metadados: { observacoes: 20, taxaErro: 0.1 },
      agora,
    });
    await new MonitorOperacoes(repo, audit, anotacoes, operacoes, {
      janelaMs: 15 * 60_000,
      minObservacoes: 20,
      erroAtencao: 0.05,
      erroCritica: 0.2,
      p95AtencaoMs: 10_000,
      p95CriticaMs: 30_000,
      truncamentoAtencao: 0.1,
    }).executar(agora);
    const result = await new ListarAlertasOperacionais(repo, operacoes).execute("user-1", {
      acessoId: row.id,
    });
    expect(result.alertas[0]?.status).toBe("aberto");
  });

  it("rearma somente uma entrega que chegou a dead-letter", async () => {
    const { repo, row } = await acesso();
    const operacoes = new InMemoryOperacoesRepository();
    const agora = new Date();
    const { alerta } = await operacoes.upsertAlerta({
      acessoId: row.id,
      categoria: "slo",
      severidade: "atencao",
      fingerprint: "janela-consulta",
      metadados: { observacoes: 20 },
      agora,
    });
    await operacoes.enfileirar({
      acessoId: row.id,
      webhookId: "webhook-1",
      alertaId: alerta.id,
      alertaVersao: alerta.versao,
      tipoEvento: "aberto",
      agora,
    });
    const event = (await operacoes.listarEventos(row.id, 1))[0]!;
    const useCase = new RearmarWebhookOperacional(repo, operacoes);
    await expect(
      useCase.execute("user-1", {
        acessoId: row.id,
        eventoId: event.id,
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await operacoes.reclamarEventos("worker-1", agora, 60_000, 1);
    await operacoes.reagendarFalha({
      id: event.id,
      workerId: "worker-1",
      agora,
      proximaTentativaEm: agora,
      tentativas: 10,
      erroCodigo: "webhook_http",
      statusHttp: 503,
      permanente: true,
    });
    await expect(
      useCase.execute("user-1", {
        acessoId: row.id,
        eventoId: event.id,
        confirmadoPeloUsuario: true,
      }),
    ).resolves.toEqual({ success: true, rearmado: true });
  });

  it("coalesce cem execuções idênticas na mesma réplica", async () => {
    const singleflight = new MemoryQuerySingleflight();
    let calls = 0;
    const rows = await Promise.all(
      Array.from({ length: 100 }, () =>
        singleflight.run("mcp:query:acesso:a:hash", async () => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return "ok";
        }),
      ),
    );
    expect(calls).toBe(1);
    expect(rows.map((row) => row.value)).toEqual(Array.from({ length: 100 }, () => "ok"));
    expect(rows.filter((row) => row.role === "leader")).toHaveLength(1);
    await Promise.all([
      singleflight.run("mcp:query:acesso:outro-token", async () => {
        calls += 1;
        return "other";
      }),
      singleflight.run("mcp:query:acesso:outra-policy", async () => {
        calls += 1;
        return "policy";
      }),
    ]);
    expect(calls).toBe(3);
  });

  it("coalesce entre réplicas Redis depois que o líder publica o cache", async () => {
    const values = new Map<string, string>();
    const redis = {
      set: async (key: string, value: string, options: { PX: number; NX: true }) => {
        if (options.NX && values.has(key)) return null;
        values.set(key, value);
        return "OK";
      },
      get: async (key: string) => values.get(key) ?? null,
      del: async (key: string) => values.delete(key),
    };
    const cache = new Map<string, string>();
    const replicaA = new RedisQuerySingleflight(redis, 30_000, 500);
    const replicaB = new RedisQuerySingleflight(redis, 30_000, 500);
    let calls = 0;
    const run = (replica: RedisQuerySingleflight) =>
      replica.run(
        "mcp:query:acesso:isolado:hash",
        async () => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 15));
          return "resultado";
        },
        {
          onLeaderResult: async (value) => {
            cache.set("resultado", value);
          },
          readShared: async () => cache.get("resultado"),
          waitMs: 500,
        },
      );
    const rows = await Promise.all(
      Array.from({ length: 100 }, (_, index) => run(index % 2 === 0 ? replicaA : replicaB)),
    );
    expect(calls).toBe(1);
    expect(rows.map((row) => row.value)).toEqual(Array.from({ length: 100 }, () => "resultado"));
    expect(rows.filter((row) => row.role === "leader")).toHaveLength(1);
  });

  it("assina payload seguro e entrega o evento com identificador idempotente", async () => {
    const { repo: _repo, row } = await acesso();
    const operacoes = new InMemoryOperacoesRepository();
    const agora = new Date("2026-09-08T12:00:00.000Z");
    const hook = await operacoes.salvarWebhook({
      acessoId: row.id,
      urlEnc: crypto.encrypt("https://events.example.test/hook"),
      urlHash: "hash",
      segredoEnc: crypto.encrypt("0123456789abcdef"),
      ativo: true,
    });
    const { alerta } = await operacoes.upsertAlerta({
      acessoId: row.id,
      categoria: "slo",
      severidade: "atencao",
      fingerprint: "janela-consulta",
      metadados: { observacoes: 20, taxaErro: 0.1 },
      agora,
    });
    await operacoes.enfileirar({
      acessoId: row.id,
      webhookId: hook.id,
      alertaId: alerta.id,
      alertaVersao: alerta.versao,
      tipoEvento: "aberto",
      agora,
    });
    const enviados: { eventId: string; payload: string }[] = [];
    const worker = new OperacoesWorker(
      monitorInerte,
      operacoes,
      crypto,
      logger,
      {
        validate: async (value) => new URL(value),
        resolve: async () => ({ address: "93.184.216.34", family: 4 }),
      },
      {
        timeoutMs: 1_000,
        post: async ({ eventId, payload }) => {
          enviados.push({ eventId, payload });
          return 204;
        },
      },
    );
    await worker.executarUmaVez(agora);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.payload).toContain('"observacoes":20');
    expect(enviados[0]?.payload).not.toContain("SELECT");
    expect(enviados[0]?.payload).not.toContain("0123456789abcdef");
    expect((await operacoes.listarEventos(row.id, 1))[0]?.entregueEm).not.toBeNull();
    expect(assinaturaWebhook("2026-09-08T12:00:00.000Z", '{"id":"evt"}', "segredo")).toBe(
      "sha256=edda88a1bb2fae45d95b58222ee50b121c219b392f8044ab5ef2502a580ee319",
    );
  });

  it("transforma falha de entrega em dead-letter sem persistir texto de rede", async () => {
    const { repo: _repo, row } = await acesso();
    const operacoes = new InMemoryOperacoesRepository();
    const agora = new Date();
    const hook = await operacoes.salvarWebhook({
      acessoId: row.id,
      urlEnc: crypto.encrypt("https://events.example.test/hook"),
      urlHash: "hash",
      segredoEnc: crypto.encrypt("0123456789abcdef"),
      ativo: true,
    });
    const { alerta } = await operacoes.upsertAlerta({
      acessoId: row.id,
      categoria: "slo",
      severidade: "atencao",
      fingerprint: "janela-consulta",
      metadados: { observacoes: 20 },
      agora,
    });
    await operacoes.enfileirar({
      acessoId: row.id,
      webhookId: hook.id,
      alertaId: alerta.id,
      alertaVersao: alerta.versao,
      tipoEvento: "aberto",
      agora,
    });
    const worker = new OperacoesWorker(
      monitorInerte,
      operacoes,
      crypto,
      logger,
      {
        validate: async (value) => new URL(value),
        resolve: async () => ({ address: "93.184.216.34", family: 4 }),
      },
      {
        timeoutMs: 1_000,
        maxAttempts: 1,
        post: async () => Promise.reject(new Error("ECONNREFUSED events.example.test")),
      },
    );
    await worker.executarUmaVez(agora);
    const event = (await operacoes.listarEventos(row.id, 1))[0]!;
    expect(event.falhaPermanenteEm).not.toBeNull();
    expect(event.ultimoErroCodigo).toBe("webhook_delivery_failed");
    expect(JSON.stringify(event)).not.toContain("events.example.test");
  });
});
