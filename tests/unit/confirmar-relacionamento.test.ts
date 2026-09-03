import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { ConfirmarRelacionamento } from "../../src/application/use-cases/skills.js";
import { escopoFromSqlModelo } from "../../src/application/use-cases/shared/escopo-from-modelo.js";
import {
  inferirTipoJoinDoSql,
  resolverTipoJoinConfirmacao,
} from "../../src/application/use-cases/shared/resolver-tipo-join.js";
import { parseSqlModelo } from "../../src/application/use-cases/shared/sql-modelo.js";
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

const sqlLeft =
  "SELECT p.codigo, c.nome FROM pedido p LEFT JOIN cliente c ON c.codcliente = p.codcliente WHERE p.codigo = :id";

const setup = async () => {
  const plug = new FakePlugServer();
  plug.approve(agentId);
  const usuarios = new InMemoryUsuarioRepository();
  const acessos = new InMemoryAcessoRepository();
  const grafo = new InMemoryGrafoRepository();
  const skills = new InMemorySkillRepository();
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
      acessoId: created.acessoId,
    nome: "pedido",
    origem: "validado_execucao",
    autorUsuarioId: created.usuarioId,
  });
  await grafo.mergeTabela({
      acessoId: created.acessoId,
    nome: "cliente",
    origem: "validado_execucao",
    autorUsuarioId: created.usuarioId,
  });
  return {
    created,
    grafo,
    skills,
    confirmar: new ConfirmarRelacionamento(acessos, grafo, skills),
  };
};

describe("resolverTipoJoinConfirmacao", () => {
  it("informado vence; SQL LEFT vence grafo inner; sem inferência assume inner", () => {
    expect(
      resolverTipoJoinConfirmacao({ informado: "inner", doSql: "left join", doGrafo: "left join" }),
    ).toBe("inner");
    expect(resolverTipoJoinConfirmacao({ doSql: "left join", doGrafo: "inner" })).toBe("left join");
    expect(resolverTipoJoinConfirmacao({ doGrafo: "left join" })).toBe("left join");
    expect(resolverTipoJoinConfirmacao({})).toBe("inner");
  });

  it("infere LEFT do sqlModelo", () => {
    expect(
      inferirTipoJoinDoSql(sqlLeft, "pedido", "cliente", [
        { colunaOrigem: "codcliente", colunaDestino: "codcliente" },
      ]),
    ).toMatch(/left/i);
  });
});

describe("ConfirmarRelacionamento", () => {
  it("persiste cardinalidade confirmada pelo usuário", async () => {
    const { created, grafo, confirmar } = await setup();

    await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tabelaOrigem: "pedido",
      colunaOrigem: "codcliente",
      tabelaDestino: "cliente",
      colunaDestino: "codcliente",
      tipoJoin: "inner",
      cardinalidade: "N:1",
    });

    const rels = await grafo.listRelacionamentos(created.acessoId);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.pares).toHaveLength(1);
    expect(rels[0]).toMatchObject({
      cardinalidade: "N:1",
      origem: "confirmado_usuario",
    });
  });

  it("sem skillId devolve hint de que o validador publicado não vê o JOIN", async () => {
    const { created, confirmar } = await setup();
    const result = await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tabelaOrigem: "pedido",
      colunaOrigem: "codcliente",
      tabelaDestino: "cliente",
      colunaDestino: "codcliente",
      tipoJoin: "inner",
      cardinalidade: "N:1",
    });
    expect(result.skill).toBeUndefined();
    expect(result.hint).toMatch(/skillId/i);
    expect(result.hint).toMatch(/pacote/i);
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
      acessoId: created.acessoId,
      nome: "receber",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeTabela({
      acessoId: created.acessoId,
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
    const rels = await grafo.listRelacionamentos(created.acessoId);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.pares).toHaveLength(2);
    expect(rels[0]?.paresFingerprint).toContain("codcli=codcli");
    expect(rels[0]?.cardinalidade).toBe("N:1");
    expect(rels[0]?.tipoJoin).toBe("inner");
  });

  it("sem tipoJoin preserva LEFT já inferido no grafo", async () => {
    const { created, grafo, confirmar } = await setup();
    const pedido = await grafo.findTabelaByNome(created.acessoId, "pedido");
    const cliente = await grafo.findTabelaByNome(created.acessoId, "cliente");
    expect(pedido && cliente).toBeTruthy();
    await grafo.mergeRelacionamento({
      acessoId: created.acessoId,
      tabelaOrigemId: pedido!.id,
      colunaOrigem: "codcliente",
      tabelaDestinoId: cliente!.id,
      colunaDestino: "codcliente",
      pares: [{ colunaOrigem: "codcliente", colunaDestino: "codcliente" }],
      tipoJoin: "left join",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });

    await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tabelaOrigem: "pedido",
      colunaOrigem: "codcliente",
      tabelaDestino: "cliente",
      colunaDestino: "codcliente",
      cardinalidade: "N:1",
    });

    const rels = await grafo.listRelacionamentos(created.acessoId);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.tipoJoin.toLowerCase()).toMatch(/left/);
    expect(rels[0]?.cardinalidade).toBe("N:1");
  });

  it("sem tipoJoin preserva LEFT do sqlModelo (não grava inner)", async () => {
    const { created, grafo, skills, confirmar } = await setup();
    const escopo = escopoFromSqlModelo(parseSqlModelo(sqlLeft));
    expect(escopo.relacionamentos[0]?.tipoJoin.toLowerCase()).toMatch(/left/);
    const escopoComInner = {
      ...escopo,
      relacionamentos: escopo.relacionamentos.map((rel) => ({ ...rel, tipoJoin: "inner" })),
    };
    const skill = await skills.create({
      acessoId: created.acessoId,
      slug: "pedidos",
      nome: "Pedidos",
      descricao: "lista",
      sqlModelo: sqlLeft,
      escopo: escopoComInner,
      autorUsuarioId: created.usuarioId,
    });

    await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      tabelaOrigem: "pedido",
      colunaOrigem: "codcliente",
      tabelaDestino: "cliente",
      colunaDestino: "codcliente",
      cardinalidade: "N:1",
    });

    const rels = await grafo.listRelacionamentos(created.acessoId);
    expect(rels[0]?.tipoJoin.toLowerCase()).toMatch(/left/);
    const updated = await skills.findById(skill.id);
    expect(updated?.escopo.relacionamentos[0]?.tipoJoin.toLowerCase()).toMatch(/left/);
  });
});
