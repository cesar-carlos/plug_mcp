import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { ListarSkills, ListarSqlModelos } from "../../src/application/use-cases/skills.js";
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

describe("ListarSqlModelos", () => {
  it("devolve o sqlModelo das skills do acesso e não é o envelope de listar_skills", async () => {
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
    const sqlClientes = "SELECT c.CodEmpresa AS empresa FROM ContaReceber c WHERE c.CodEmpresa > 0";
    await skills.create({
      acessoId: created.acessoId,
      slug: "clientes",
      nome: "Clientes",
      descricao: "Lista clientes",
      sqlModelo: sqlClientes,
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

    const modelos = await new ListarSqlModelos(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    const listed = await new ListarSkills(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });

    const clientes = modelos.skills.find((skill) => skill.slug === "clientes");
    const vendas = modelos.skills.find((skill) => skill.slug === "vendas");
    expect(modelos.skills.map((skill) => skill.slug).sort()).toEqual(["clientes", "vendas"]);
    expect(clientes?.sqlModelo).toBe(sqlClientes);
    expect(vendas?.sqlModelo).toContain("erp.dbo.pedido");
    expect(vendas?.faltas.some((falta) => falta.kind === "sql")).toBe(true);
    expect(listed.skills[0]).not.toHaveProperty("sqlModelo");
  });
});
