import { describe, expect, it, vi } from "vitest";
import { ConsultarDados } from "../../src/application/use-cases/consultar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryUsuarioRepository,
  InMemorySkillRepository,
  InMemoryAuditLog,
  InMemoryAprendizadoRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { MemoryQueryResultCache } from "../../src/infrastructure/cache/query-result-cache.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { stubSessions } from "../helpers/stub-sessions.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
const fixture = async () => {
  const crypto = new NodeCryptoAdapter(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
  const acessos = new InMemoryAcessoRepository(),
    skills = new InMemorySkillRepository(),
    aprendizado = new InMemoryAprendizadoRepository(),
    plug = new FakePlugServer();
  const agentId = "11111111-1111-4111-8111-111111111111";
  plug.approve(agentId);
  const created = await new RegistrarAcesso(
    new InMemoryUsuarioRepository(),
    acessos,
    plug,
    crypto,
    new SetupCodeStore(),
    "http://localhost",
    0,
  ).execute({
    email: "ci@example.test",
    senha: "synthetic-only",
    agentId,
    dialeto: "postgres",
    clientToken: "synthetic-client-token",
  });
  await acessos.updateEscopoPadrao(
    created.acessoId,
    { empresa: "A", bindings: [{ tabela: "fato", coluna: "empresa", param: "empresa" }] },
    null,
  );
  const skill = await skills.create({
    acessoId: created.acessoId,
    slug: "total",
    nome: "Total",
    descricao: "total",
    sqlModelo: "SELECT SUM(f.valor) total FROM fato f WHERE f.empresa=:empresa",
    escopo: {
      tabelas: ["fato"],
      colunasPorTabela: { fato: ["valor", "empresa"] },
      relacionamentos: [],
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: 2,
    },
    autorUsuarioId: created.usuarioId,
  });
  await skills.setStatus(skill.id, "publicada");
  const consultar = new ConsultarDados(
    acessos,
    skills,
    plug,
    stubSessions(),
    crypto,
    new InMemoryAuditLog(),
    500,
    5000,
    { cache: new MemoryQueryResultCache(), aprendizado },
  );
  const execute = () =>
    consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      pergunta: "Qual é o total?",
      params: { empresa: "B" },
    });
  return { acessos, skills, aprendizado, plug, created, skill, execute };
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
describe("revogação antes da entrega", () => {
  it.each(["bearer", "empresa", "publicacao", "policy"])(
    "bloqueia mudança de %s durante o hub",
    async (kind) => {
      const c = await fixture(),
        started = deferred(),
        release = deferred();
      c.plug.sqlImpl = async () => {
        started.resolve();
        await release.promise;
        return { columns: ["total"], rows: [{ total: 12 }] };
      };
      const result = c.execute();
      await started.promise;
      if (kind === "bearer") await c.acessos.updateTokenHash(c.created.acessoId, "revoked", null);
      if (kind === "empresa")
        await c.acessos.updateEscopoPadrao(c.created.acessoId, { empresa: "B" }, null);
      if (kind === "publicacao") await c.skills.suspenderPublicacao(c.skill.id);
      if (kind === "policy") c.plug.policy = { allTables: false, tables: [] };
      const check = expect(result).rejects.toMatchObject({
        code:
          kind === "publicacao"
            ? "SKILL_NOT_PUBLISHED"
            : kind === "policy"
              ? "PERMISSION_DENIED"
              : "ACCESS_REVOKED",
      });
      release.resolve();
      await check;
    },
  );
  it("cache hit não serve dados quando a autoridade falha após o preflight", async () => {
    const c = await fixture();
    const sql = vi.fn(async () => ({ columns: ["total"], rows: [{ total: 12 }] }));
    c.plug.sqlImpl = sql;
    await c.execute();
    let checks = 0;
    c.plug.getClientTokenPolicy = async () => {
      if (++checks > 1)
        throw new DomainError({
          code: ERROR_CODES.PLUG_SERVER_ERROR,
          message: "unavailable",
          hint: "retry authority",
        });
      return { allTables: true, tables: [] };
    };
    await expect(c.execute()).rejects.toMatchObject({ code: "PLUG_SERVER_ERROR" });
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("falha de captura não perde resultado e candidatos vinculam a publicação", async () => {
    const c = await fixture();
    c.plug.sqlImpl = async () => ({ columns: ["total"], rows: [{ total: 12 }] });
    const first = await c.execute();
    const candidate = await c.aprendizado.obterConsulta(
      c.created.acessoId,
      first.aprendizadoGravado!.consultaId,
    );
    expect(candidate).toMatchObject({
      status: "candidata",
      publicacoes: [{ skillId: c.skill.id }],
    });
    c.aprendizado.salvarConsulta = async () => {
      throw new Error("storage failed");
    };
    const second = await c.execute();
    expect(second.rows).toEqual([{ total: 12 }]);
    expect(second.avisos).toContainEqual(expect.objectContaining({ code: "APRENDIZADO_IGNORADO" }));
  });
  it("revalida revogação ocorrida durante captura do aprendizado", async () => {
    const c = await fixture(),
      started = deferred(),
      release = deferred(),
      save = c.aprendizado.salvarConsulta.bind(c.aprendizado);
    c.plug.sqlImpl = async () => ({ columns: ["total"], rows: [{ total: 12 }] });
    c.aprendizado.salvarConsulta = async (input) => {
      started.resolve();
      await release.promise;
      return save(input);
    };
    const result = c.execute();
    await started.promise;
    await c.acessos.updateTokenHash(c.created.acessoId, "revoked", null);
    const check = expect(result).rejects.toMatchObject({ code: "ACCESS_REVOKED" });
    release.resolve();
    await check;
  });
});
