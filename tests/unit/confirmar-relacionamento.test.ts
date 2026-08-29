import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { ConfirmarRelacionamento } from "../../src/application/use-cases/skills.js";
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

describe("ConfirmarRelacionamento", () => {
  it("persiste cardinalidade confirmada pelo usuário", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
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
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    await grafo.mergeTabela({
      agentId,
      nome: "pedido",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeTabela({
      agentId,
      nome: "cliente",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const confirmar = new ConfirmarRelacionamento(
      acessos,
      grafo,
      new InMemorySkillRepository(),
    );

    await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tabelaOrigem: "pedido",
      colunaOrigem: "codcliente",
      tabelaDestino: "cliente",
      colunaDestino: "codcliente",
      tipoJoin: "inner",
      cardinalidade: "N:1",
    });

    const rels = await grafo.listRelacionamentos(agentId);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.pares).toHaveLength(1);
    expect(rels[0]).toMatchObject({
      cardinalidade: "N:1",
      origem: "confirmado_usuario",
    });
  });

  it("persiste JOIN composto com pares[]", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
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
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    await grafo.mergeTabela({
      agentId,
      nome: "receber",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeTabela({
      agentId,
      nome: "cliente",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const confirmar = new ConfirmarRelacionamento(acessos, grafo, new InMemorySkillRepository());
    await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tabelaOrigem: "receber",
      tabelaDestino: "cliente",
      pares: [
        { colunaOrigem: "codcli", colunaDestino: "codcli" },
        { colunaOrigem: "empresa", colunaDestino: "empresa" },
      ],
      cardinalidade: "N:1",
    });
    const rels = await grafo.listRelacionamentos(agentId);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.pares).toHaveLength(2);
    expect(rels[0]?.paresFingerprint).toContain("codcli=codcli");
    expect(rels[0]?.cardinalidade).toBe("N:1");
  });
});
