import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { ListarSkills } from "../../src/application/use-cases/skills.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("listar_skills com sqlModelo ilegível", () => {
  it("devolve as outras skills e marca falta sql na ilegível", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const grafo = new InMemoryGrafoRepository();
    const created = await new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    ).execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    await skills.create({
      acessoId: created.acessoId,
      slug: "clientes",
      nome: "Clientes",
      descricao: "Lista clientes",
      sqlModelo: "SELECT c.CodEmpresa AS empresa FROM ContaReceber c WHERE c.CodEmpresa > 0",
      autorUsuarioId: created.usuarioId,
    });
    await skills.create({
      acessoId: created.acessoId,
      slug: "vendas",
      nome: "Vendas",
      descricao: "Vendas com banco qualificado",
      sqlModelo: "SELECT p.id AS id FROM erp.dbo.pedido p WHERE p.id > 0",
      autorUsuarioId: created.usuarioId,
    });

    const listed = await new ListarSkills(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });

    expect(listed.skills.map((skill) => skill.slug).sort()).toEqual(["clientes", "vendas"]);
    const vendas = listed.skills.find((skill) => skill.slug === "vendas");
    const clientes = listed.skills.find((skill) => skill.slug === "clientes");
    expect(vendas?.podeLiberar).toBe(false);
    expect(vendas?.fluxoTreino.proximoPasso).toBe("atualizar_skill");
    expect(vendas?.faltas.some((falta) => falta.kind === "sql")).toBe(true);
    expect(clientes?.faltas.some((falta) => falta.kind === "sql")).toBe(false);
  });
});
