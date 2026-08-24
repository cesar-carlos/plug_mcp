import { describe, expect, it } from "vitest";
import { BuscarContexto } from "../../src/application/use-cases/consultar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("BuscarContexto", () => {
  const setup = async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const anotacoes = new InMemoryAnotacaoGrafoRepository();
    const registrar = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    );
    const created = await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
    };
    const buscar = new BuscarContexto(
      acessos,
      grafo,
      skills,
      anotacoes,
      plug,
      sessions,
      crypto,
    );
    return { buscar, created, skills };
  };

  it("sem skill publicada devolve consultaPermitida false e SKILL_GAP", async () => {
    const { buscar, created } = await setup();
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "produto",
    });
    expect(result.success).toBe(true);
    expect(result.consultaPermitida).toBe(false);
    expect(result.gap?.code).toBe("SKILL_GAP");
    expect(result.skillsPublicadas).toHaveLength(0);
    expect(result.grafoParaTreino).toBeDefined();
  });

  it("com skill publicada lista só publicadas e permite consulta", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista de produtos",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await skills.create({
      agentId,
      slug: "rascunho-produtos",
      nome: "Rascunho produtos",
      descricao: "Ainda não publica",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "produtos",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(result.gap).toBeUndefined();
    expect(result.skillsPublicadas).toHaveLength(1);
  });
});
